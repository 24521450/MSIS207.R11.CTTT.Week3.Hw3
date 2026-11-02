import { afterEach, describe, expect, it, vi } from "vitest";
import { MockAirdropService } from "./mockAirdropService";
import type { AirdropClock, PubgCrateDrop } from "./contracts";

const base = 10_000;
const drop: PubgCrateDrop = {
  id: "live",
  title: "Test crate",
  priceVnd: 49_000,
  remainingStock: 1,
  dropEpochMs: base,
  expiresAtEpochMs: base + 5_000,
  rewardKind: "SUPPLY_CRATE",
  rewardAmount: 1,
  rewardUnit: "vật phẩm mô phỏng",
};

function makeClock(now = base): AirdropClock {
  return {
    now: () => now,
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle),
    addVisibilityListener: () => () => undefined,
  };
}

describe("MockAirdropService", () => {
  afterEach(() => vi.useRealTimers());

  it("is idempotent for a claim ID and never lets stock go below zero", async () => {
    vi.useFakeTimers();
    const rewards: readonly PubgCrateDrop[] = [
      { ...drop, id: "vip", rewardKind: "PVS_VIP_TICKET", rewardAmount: 1, rewardUnit: "vé VIP mô phỏng" },
      { ...drop, id: "gcoin", rewardKind: "GCOIN_CRATE", rewardAmount: 2_000, rewardUnit: "G-Coin mô phỏng" },
    ];
    const service = new MockAirdropService(rewards, { clock: makeClock(), latencyMs: 50 });
    for (const dropId of ["vip", "gcoin"]) {
      const first = service.claim(dropId, "claim-one");
      const duplicate = service.claim(dropId, "claim-one");
      await vi.advanceTimersByTimeAsync(50);
      const [a, b] = await Promise.all([first, duplicate]);
      expect(a).toEqual(b);
      expect(a.kind).toBe("success");
      expect(service.getSnapshot(dropId)).toEqual({ stock: 0, version: 1 });
      const afterSoldOut = service.claim(dropId, "claim-two");
      await vi.advanceTimersByTimeAsync(50);
      expect((await afterSoldOut).kind).toBe("unavailable");
      expect(service.getSnapshot(dropId).stock).toBe(0);
    }
  });

  it("reconciles a deterministic 409 from the service snapshot when a rival empties stock", async () => {
    vi.useFakeTimers();
    const service = new MockAirdropService([drop], { clock: makeClock(), latencyMs: 20, scenario: "conflict" });
    const pending = service.claim("live", "racer");
    await vi.advanceTimersByTimeAsync(20);
    const result = await pending;
    expect(result).toMatchObject({ kind: "conflict", snapshot: { stock: 0, version: 1 } });
    expect(service.getSnapshot("live").stock).toBe(0);
  });

  it("leaves actual stock untouched for a temporary failure and accepts a new retry ID", async () => {
    vi.useFakeTimers();
    const service = new MockAirdropService([drop], { clock: makeClock(), latencyMs: 20, scenario: "temporary-error" });
    const first = service.claim("live", "failed-attempt");
    await vi.advanceTimersByTimeAsync(20);
    expect((await first).kind).toBe("temporary-error");
    expect(service.getSnapshot("live").stock).toBe(1);
    service.setScenario("success");
    const retry = service.claim("live", "retry-attempt");
    await vi.advanceTimersByTimeAsync(20);
    expect((await retry).kind).toBe("success");
    expect(service.getSnapshot("live").stock).toBe(0);
  });

  it("uses the scenario captured when a request starts, even if the selector changes during latency", async () => {
    vi.useFakeTimers();
    const service = new MockAirdropService([drop], { clock: makeClock(), latencyMs: 20, scenario: "temporary-error" });
    const pending = service.claim("live", "captured-scenario");
    service.setScenario("success");
    await vi.advanceTimersByTimeAsync(20);
    expect((await pending).kind).toBe("temporary-error");
    expect(service.getSnapshot("live").stock).toBe(1);

    const next = service.claim("live", "next-scenario");
    await vi.advanceTimersByTimeAsync(20);
    expect((await next).kind).toBe("success");
    expect(service.getSnapshot("live").stock).toBe(0);
  });

  it("checks the same offset clock at open and close boundaries", async () => {
    vi.useFakeTimers();
    const service = new MockAirdropService([drop], { clock: makeClock(base - 500), latencyMs: 10, serverOffsetMs: 500 });
    const pending = service.claim("live", "at-open");
    await vi.advanceTimersByTimeAsync(10);
    expect((await pending).kind).toBe("success");

    const closing = new MockAirdropService([drop], {
      clock: { ...makeClock(base + 4_500), now: () => base + 4_500 },
      latencyMs: 10,
      serverOffsetMs: 500,
    });
    const afterClose = closing.claim("live", "after-close");
    await vi.advanceTimersByTimeAsync(10);
    expect(await afterClose).toMatchObject({ kind: "unavailable", reason: "expired" });
  });

  it("marks a response stale after reset while a request is in flight", async () => {
    vi.useFakeTimers();
    const service = new MockAirdropService([drop], { clock: makeClock(), latencyMs: 30 });
    const pending = service.claim("live", "old-session");
    service.reset();
    await vi.advanceTimersByTimeAsync(30);
    expect((await pending).kind).toBe("stale");
    expect(service.getSnapshot("live")).toEqual({ stock: 1, version: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
