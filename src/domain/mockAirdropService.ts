import type {
  AirdropClock,
  AirdropService,
  ClaimResult,
  ClaimScenario,
  DropSnapshot,
  PubgCrateDrop,
} from "./contracts";
import { getDropPhase } from "./airdrop";

const browserClock: AirdropClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle),
  addVisibilityListener: (callback) => {
    document.addEventListener("visibilitychange", callback);
    return () => document.removeEventListener("visibilitychange", callback);
  },
};

export class MockAirdropService implements AirdropService {
  private readonly drops: ReadonlyMap<string, PubgCrateDrop>;
  private readonly initialSnapshots: ReadonlyMap<string, DropSnapshot>;
  private readonly clock: AirdropClock;
  private readonly latencyMs: number;
  private readonly serverOffsetMs: number;
  private readonly listeners = new Set<
    (snapshots: Readonly<Record<string, DropSnapshot>>) => void
  >();
  private readonly inFlight = new Map<string, Promise<ClaimResult>>();
  private readonly processed = new Map<string, ClaimResult>();
  private snapshots = new Map<string, DropSnapshot>();
  private scenario: ClaimScenario = "success";
  private session = 0;

  constructor(
    drops: readonly PubgCrateDrop[],
    options: {
      clock?: AirdropClock;
      latencyMs?: number;
      serverOffsetMs?: number;
      scenario?: ClaimScenario;
    } = {},
  ) {
    this.drops = new Map(drops.map((drop) => [drop.id, drop]));
    this.initialSnapshots = new Map(
      drops.map((drop) => [drop.id, Object.freeze({ stock: drop.remainingStock, version: 0 })]),
    );
    this.clock = options.clock ?? browserClock;
    this.latencyMs = options.latencyMs ?? 650;
    this.serverOffsetMs = options.serverOffsetMs ?? 0;
    this.scenario = options.scenario ?? "success";
    this.snapshots = new Map(this.initialSnapshots);
  }

  getSnapshot(dropId: string): DropSnapshot {
    const snapshot = this.snapshots.get(dropId);
    if (!snapshot) throw new RangeError(`Unknown airdrop: ${dropId}`);
    return snapshot;
  }

  getAllSnapshots(): Readonly<Record<string, DropSnapshot>> {
    return Object.freeze(Object.fromEntries(this.snapshots));
  }

  subscribe(
    listener: (snapshots: Readonly<Record<string, DropSnapshot>>) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setScenario(scenario: ClaimScenario): void {
    this.scenario = scenario;
  }

  getScenario(): ClaimScenario {
    return this.scenario;
  }

  claim(dropId: string, claimId: string): Promise<ClaimResult> {
    const key = `${dropId}:${claimId}`;
    const processed = this.processed.get(key);
    if (processed) return Promise.resolve(processed);
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    if (!this.drops.has(dropId)) throw new RangeError(`Unknown airdrop: ${dropId}`);

    const requestSession = this.session;
    const scenario = this.scenario;
    const request = new Promise<ClaimResult>((resolve) => {
      this.clock.setTimeout(() => {
        const current = this.inFlight.get(key);
        if (current !== request) return;
        this.inFlight.delete(key);
        let result: ClaimResult;
        if (requestSession !== this.session) {
          result = { kind: "stale", claimId, snapshot: this.getSnapshot(dropId) };
        } else {
          result = this.processClaim(dropId, claimId, scenario);
          this.processed.set(key, result);
        }
        resolve(result);
      }, this.latencyMs);
    });
    this.inFlight.set(key, request);
    return request;
  }

  reset(): void {
    this.session += 1;
    this.processed.clear();
    this.snapshots = new Map(this.initialSnapshots);
    this.emit();
  }

  private processClaim(
    dropId: string,
    claimId: string,
    scenario: ClaimScenario,
  ): ClaimResult {
    const drop = this.drops.get(dropId);
    if (!drop) throw new RangeError(`Unknown airdrop: ${dropId}`);
    const current = this.getSnapshot(dropId);
    const now = this.clock.now() + this.serverOffsetMs;
    const phase = getDropPhase(drop, current.stock, now);
    if (phase === "WARMUP") {
      return { kind: "unavailable", claimId, reason: "warmup", snapshot: current };
    }
    if (phase === "EXPIRED") {
      return { kind: "unavailable", claimId, reason: "expired", snapshot: current };
    }
    if (phase === "LOOTED_OUT") {
      return { kind: "unavailable", claimId, reason: "sold-out", snapshot: current };
    }

    if (scenario === "temporary-error") {
      return { kind: "temporary-error", claimId, snapshot: current };
    }
    if (scenario === "conflict") {
      const emptied = Object.freeze({ stock: 0, version: current.version + 1 });
      this.snapshots.set(dropId, emptied);
      this.emit();
      return { kind: "conflict", claimId, snapshot: emptied };
    }

    const updated = Object.freeze({ stock: Math.max(0, current.stock - 1), version: current.version + 1 });
    this.snapshots.set(dropId, updated);
    this.emit();
    return { kind: "success", claimId, snapshot: updated };
  }

  private emit(): void {
    const snapshots = this.getAllSnapshots();
    // Keep the current listener list stable if a subscriber unsubscribes during notification.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const listener of [...this.listeners]) listener(snapshots);
  }
}
