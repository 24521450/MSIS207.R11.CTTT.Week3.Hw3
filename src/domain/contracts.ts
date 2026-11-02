export type DropPhase = "WARMUP" | "AIRDROP_LIVE" | "LOOTED_OUT" | "EXPIRED";
export type AirdropRewardKind = "SUPPLY_CRATE" | "PVS_VIP_TICKET" | "GCOIN_CRATE";

export interface PubgCrateDrop {
  readonly id: string;
  readonly title: string;
  readonly priceVnd: number;
  readonly remainingStock: number;
  readonly dropEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly rewardKind: AirdropRewardKind;
  readonly rewardAmount: number;
  readonly rewardUnit: string;
}

export interface PubgVnSquadStanding {
  readonly squadId: string;
  readonly squadName: string;
  readonly wwcdCount: number;
  readonly placementPts: number;
  readonly killPts: number;
}

export interface KillFeedEvent {
  readonly id: string;
  readonly squadId: string;
  readonly squadName: string;
  readonly content: string;
  readonly occurredAtEpochMs: number;
}

export type ClaimScenario = "success" | "conflict" | "temporary-error";

export interface DropSnapshot {
  readonly stock: number;
  readonly version: number;
}

export type ClaimResult =
  | { readonly kind: "success"; readonly claimId: string; readonly snapshot: DropSnapshot }
  | { readonly kind: "conflict"; readonly claimId: string; readonly snapshot: DropSnapshot }
  | { readonly kind: "temporary-error"; readonly claimId: string; readonly snapshot: DropSnapshot }
  | {
      readonly kind: "unavailable";
      readonly claimId: string;
      readonly reason: "warmup" | "expired" | "sold-out";
      readonly snapshot: DropSnapshot;
    }
  | { readonly kind: "stale"; readonly claimId: string; readonly snapshot: DropSnapshot };

export interface AirdropService {
  getSnapshot(dropId: string): DropSnapshot;
  getAllSnapshots(): Readonly<Record<string, DropSnapshot>>;
  subscribe(listener: (snapshots: Readonly<Record<string, DropSnapshot>>) => void): () => void;
  setScenario(scenario: ClaimScenario): void;
  getScenario(): ClaimScenario;
  claim(dropId: string, claimId: string): Promise<ClaimResult>;
  reset(): void;
}

export interface AirdropClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
  addVisibilityListener(callback: () => void): () => void;
}
