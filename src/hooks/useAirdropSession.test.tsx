import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAirdropSession } from "./useAirdropSession";

describe("useAirdropSession", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["drop-live", "drop-gcoin"])("locks %s synchronously so two clicks send only one request", async (dropId) => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useAirdropSession());
    const serviceClaim = vi.spyOn(result.current.service, "claim");
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.claim(dropId);
      second = result.current.claim(dropId);
    });
    expect(serviceClaim).toHaveBeenCalledTimes(1);
    expect(result.current.displayedStock[dropId]).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await Promise.all([first, second]);
    expect(result.current.snapshots[dropId]).toEqual({ stock: 2, version: 1 });
    expect(result.current.displayedStock[dropId]).toBe(2);
    expect(result.current.claims[dropId]?.status).toBe("success");
  });

  it.each(["drop-live", "drop-gcoin"])("reconciles %s to the service snapshot after 409", async (dropId) => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useAirdropSession());
    act(() => result.current.setScenario("conflict"));
    let claim!: Promise<unknown>;
    act(() => { claim = result.current.claim(dropId); });
    expect(result.current.displayedStock[dropId]).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await claim;
    expect(result.current.snapshots[dropId]).toEqual({ stock: 0, version: 1 });
    expect(result.current.displayedStock[dropId]).toBe(0);
    expect(result.current.claims[dropId]?.status).toBe("conflict");
  });

  it.each(["drop-live", "drop-gcoin"])("rolls back %s after a temporary failure and permits retry", async (dropId) => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useAirdropSession());
    act(() => result.current.setScenario("temporary-error"));
    let first!: Promise<unknown>;
    act(() => { first = result.current.claim(dropId); });
    expect(result.current.displayedStock[dropId]).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await first;
    expect(result.current.displayedStock[dropId]).toBe(3);
    expect(result.current.claims[dropId]?.status).toBe("error");
    act(() => result.current.setScenario("success"));
    let retry!: Promise<unknown>;
    act(() => { retry = result.current.claim(dropId); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await retry;
    expect(result.current.displayedStock[dropId]).toBe(2);
    expect(result.current.claims[dropId]?.status).toBe("success");
  });

  it("keeps a request pending through scenario changes and applies the new scenario only to its next claim", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useAirdropSession());
    act(() => result.current.setScenario("temporary-error"));
    let first!: Promise<unknown>;
    act(() => { first = result.current.claim("drop-live"); });
    const pendingClaimId = result.current.claims["drop-live"]?.claimId;
    expect(result.current.claims["drop-live"]).toMatchObject({ status: "pending", message: "Đang xác nhận với kho mô phỏng…" });

    act(() => result.current.setScenario("success"));
    expect(result.current.scenario).toBe("success");
    expect(result.current.claims["drop-live"]).toMatchObject({
      status: "pending",
      message: "Đang xác nhận với kho mô phỏng…",
      claimId: pendingClaimId,
    });
    expect(result.current.displayedStock["drop-live"]).toBe(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await expect(first).resolves.toMatchObject({ kind: "temporary-error" });
    expect(result.current.displayedStock["drop-live"]).toBe(3);
    expect(result.current.claims["drop-live"]?.status).toBe("error");

    let next!: Promise<unknown>;
    act(() => { next = result.current.claim("drop-live"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await expect(next).resolves.toMatchObject({ kind: "success" });
    expect(result.current.displayedStock["drop-live"]).toBe(2);
  });

  it("ignores an old response after reset and releases the claim lock for the new session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useAirdropSession());
    let oldRequest!: Promise<unknown>;
    act(() => { oldRequest = result.current.claim("drop-live"); });
    act(() => result.current.reset());
    expect(result.current.displayedStock["drop-live"]).toBe(3);
    let newRequest!: Promise<unknown>;
    act(() => { newRequest = result.current.claim("drop-live"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await Promise.all([oldRequest, newRequest]);
    expect(result.current.snapshots["drop-live"]).toEqual({ stock: 2, version: 1 });
    expect(result.current.claims["drop-live"]?.status).toBe("success");
  });

  it("does not update state after unmount while a request is pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result, unmount } = renderHook(() => useAirdropSession());
    let request!: Promise<unknown>;
    act(() => { request = result.current.claim("drop-live"); });
    unmount();
    await vi.advanceTimersByTimeAsync(650);
    await request;
    expect(vi.getTimerCount()).toBe(0);
  });
});
