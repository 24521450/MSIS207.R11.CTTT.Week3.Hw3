import { describe, expect, it } from "vitest";
import { formatVnd, getDropPhase } from "./airdrop";
import type { PubgCrateDrop } from "./contracts";

const drop: PubgCrateDrop = {
  id: "test",
  title: "Test crate",
  priceVnd: 49_000,
  remainingStock: 1,
  dropEpochMs: 1_000,
  expiresAtEpochMs: 2_000,
};

describe("airdrop domain", () => {
  it("applies exact phase boundaries in expiry, warmup, stock order", () => {
    expect(getDropPhase(drop, 1, 999)).toBe("WARMUP");
    expect(getDropPhase(drop, 1, 1_000)).toBe("AIRDROP_LIVE");
    expect(getDropPhase(drop, 0, 1_000)).toBe("LOOTED_OUT");
    expect(getDropPhase(drop, 0, 1_999)).toBe("LOOTED_OUT");
    expect(getDropPhase(drop, 4, 2_000)).toBe("EXPIRED");
  });

  it("formats Vietnamese dong with the required Intl currency formatter", () => {
    expect(formatVnd(49_000)).toBe(new Intl.NumberFormat("vi-VN", {
      style: "currency", currency: "VND", maximumFractionDigits: 0,
    }).format(49_000));
  });
});
