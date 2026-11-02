import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AirdropService,
  ClaimResult,
  ClaimScenario,
  DropSnapshot,
  PubgCrateDrop,
} from "../domain/contracts";
import { createDemoDrops, getDropPhase } from "../domain/airdrop";
import { MockAirdropService } from "../domain/mockAirdropService";

export type ClaimStatus = "idle" | "pending" | "success" | "conflict" | "error";

export interface DropClaimState {
  readonly status: ClaimStatus;
  readonly message: string;
  readonly claimId?: string;
}

interface OptimisticClaim {
  readonly dropId: string;
  readonly claimId: string;
  readonly baseVersion: number;
}

function createService(now: number, serverOffsetMs: number): { drops: readonly PubgCrateDrop[]; service: AirdropService } {
  const drops = createDemoDrops(now);
  return { drops, service: new MockAirdropService(drops, { serverOffsetMs }) };
}

function createClaimId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useAirdropSession(serverOffsetMs = 0) {
  const [session, setSession] = useState(() => createService(Date.now(), serverOffsetMs));
  const [snapshots, setSnapshots] = useState<Readonly<Record<string, DropSnapshot>>>(
    () => session.service.getAllSnapshots(),
  );
  const [optimistic, setOptimistic] = useState<ReadonlyMap<string, OptimisticClaim>>(
    () => new Map(),
  );
  const [claims, setClaims] = useState<Readonly<Record<string, DropClaimState>>>({});
  const [scenario, setScenarioState] = useState<ClaimScenario>("success");
  const locks = useRef(new Map<string, string>());
  const generation = useRef(0);
  const mounted = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      locks.current.clear();
    };
  }, []);

  useEffect(() => {
    setSnapshots(session.service.getAllSnapshots());
    return session.service.subscribe(setSnapshots);
  }, [session]);

  const setScenario = useCallback((nextScenario: ClaimScenario) => {
    sessionRef.current.service.setScenario(nextScenario);
    setScenarioState(nextScenario);
    setClaims({});
  }, []);

  const displayedStock = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [dropId, snapshot] of Object.entries(snapshots)) {
      const pending = optimistic.get(dropId);
      result[dropId] = Math.max(
        0,
        snapshot.stock - (pending && pending.baseVersion === snapshot.version ? 1 : 0),
      );
    }
    return result;
  }, [optimistic, snapshots]);

  const claim = useCallback(async (dropId: string): Promise<ClaimResult | null> => {
    if (locks.current.has(dropId)) return null;
    const activeSession = sessionRef.current;
    const drop = activeSession.drops.find((item) => item.id === dropId);
    if (!drop) return null;
    const current = activeSession.service.getSnapshot(dropId);
    const now = Date.now();
    const decisionTime = now + serverOffsetMs;
    if (getDropPhase(drop, current.stock, decisionTime) !== "AIRDROP_LIVE") return null;

    const claimId = createClaimId();
    const requestGeneration = generation.current;
    locks.current.set(dropId, claimId);
    setOptimistic((previous) => new Map(previous).set(dropId, {
      dropId,
      claimId,
      baseVersion: current.version,
    }));
    setClaims((previous) => ({
      ...previous,
      [dropId]: { status: "pending", message: "Đang xác nhận với kho mô phỏng…", claimId },
    }));

    try {
      const result = await activeSession.service.claim(dropId, claimId);
      if (!mounted.current || requestGeneration !== generation.current) return result;
      setSnapshots(activeSession.service.getAllSnapshots());
      setOptimistic((previous) => {
        const next = new Map(previous);
        if (next.get(dropId)?.claimId === claimId) next.delete(dropId);
        return next;
      });
      if (result.kind === "success") {
        setClaims((previous) => ({ ...previous, [dropId]: { status: "success", message: "Đã nhận airdrop thành công.", claimId } }));
      } else if (result.kind === "conflict") {
        setClaims((previous) => ({ ...previous, [dropId]: { status: "conflict", message: "409 mô phỏng: đội khác vừa nhận hết kho. Tồn kho đã đồng bộ.", claimId } }));
      } else if (result.kind === "temporary-error") {
        setClaims((previous) => ({ ...previous, [dropId]: { status: "error", message: "Lỗi tạm thời. Tồn kho đã hoàn tác; bạn có thể thử lại.", claimId } }));
      } else if (result.kind === "unavailable") {
        const messages = {
          warmup: "Đợt tiếp tế chưa mở.",
          expired: "Đợt tiếp tế đã đóng.",
          "sold-out": "Đợt tiếp tế đã hết hàng.",
        } as const;
        setClaims((previous) => ({ ...previous, [dropId]: { status: "error", message: messages[result.reason], claimId } }));
      }
      return result;
    } catch {
      if (mounted.current && requestGeneration === generation.current) {
        setOptimistic((previous) => {
          const next = new Map(previous);
          if (next.get(dropId)?.claimId === claimId) next.delete(dropId);
          return next;
        });
        setClaims((previous) => ({
          ...previous,
          [dropId]: { status: "error", message: "Không thể kết nối service mô phỏng. Tồn kho đã hoàn tác; hãy thử lại.", claimId },
        }));
      }
      return null;
    } finally {
      if (locks.current.get(dropId) === claimId) locks.current.delete(dropId);
    }
  }, [serverOffsetMs]);

  const reset = useCallback(() => {
    generation.current += 1;
    locks.current.clear();
    const nextSession = createService(Date.now(), serverOffsetMs);
    nextSession.service.setScenario(scenario);
    sessionRef.current = nextSession;
    setSession(nextSession);
    setSnapshots(nextSession.service.getAllSnapshots());
    setOptimistic(new Map());
    setClaims({});
  }, [scenario, serverOffsetMs]);

  return {
    drops: session.drops,
    service: session.service,
    snapshots,
    displayedStock,
    claims,
    scenario,
    setScenario,
    claim,
    reset,
  };
}
