import type { DropPhase, PubgCrateDrop } from "./contracts";

export function getDropPhase(
  drop: PubgCrateDrop,
  stock: number,
  nowEpochMs: number,
): DropPhase {
  if (nowEpochMs >= drop.expiresAtEpochMs) return "EXPIRED";
  if (nowEpochMs < drop.dropEpochMs) return "WARMUP";
  if (stock <= 0) return "LOOTED_OUT";
  return "AIRDROP_LIVE";
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function createDemoDrops(nowEpochMs: number): readonly PubgCrateDrop[] {
  return [
    {
      id: "drop-warmup",
      title: "Thùng tiếp tế chiến thuật",
      priceVnd: 49_000,
      remainingStock: 4,
      dropEpochMs: nowEpochMs + 15_000,
      expiresAtEpochMs: nowEpochMs + 15_000 + 8 * 60_000,
      rewardKind: "SUPPLY_CRATE",
      rewardAmount: 1,
      rewardUnit: "vật phẩm tiếp tế mô phỏng",
    },
    {
      id: "drop-live",
      title: "PVS Grand Finals VIP Tickets",
      priceVnd: 79_000,
      remainingStock: 3,
      dropEpochMs: nowEpochMs - 1_000,
      expiresAtEpochMs: nowEpochMs + 8 * 60_000,
      rewardKind: "PVS_VIP_TICKET",
      rewardAmount: 1,
      rewardUnit: "vé VIP mô phỏng",
    },
    {
      id: "drop-gcoin",
      title: "G-Coin Crate",
      priceVnd: 59_000,
      remainingStock: 3,
      dropEpochMs: nowEpochMs - 1_000,
      expiresAtEpochMs: nowEpochMs + 8 * 60_000,
      rewardKind: "GCOIN_CRATE",
      rewardAmount: 2_000,
      rewardUnit: "G-Coin mô phỏng",
    },
    {
      id: "drop-looted",
      title: "Hòm chiến lợi phẩm cuối trận",
      priceVnd: 99_000,
      remainingStock: 0,
      dropEpochMs: nowEpochMs - 30_000,
      expiresAtEpochMs: nowEpochMs + 8 * 60_000,
      rewardKind: "SUPPLY_CRATE",
      rewardAmount: 1,
      rewardUnit: "vật phẩm tiếp tế mô phỏng",
    },
  ];
}
