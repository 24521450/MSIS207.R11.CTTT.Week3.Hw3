import { useLayoutEffect, useState } from "react";

export interface PubgAirdropTimer {
  readonly remainingMs: number;
  readonly isLive: boolean;
}

function remainingUntil(targetEpochMs: number, serverOffsetMs: number): number {
  return Math.max(0, targetEpochMs - (Date.now() + serverOffsetMs));
}

/** Deadline based: every tick is derived from the wall clock, never accumulated. */
export function usePubgAirdropTimer(
  targetEpochMs: number,
  serverOffsetMs = 0,
): PubgAirdropTimer {
  const [remainingMs, setRemainingMs] = useState(() =>
    remainingUntil(targetEpochMs, serverOffsetMs),
  );

  useLayoutEffect(() => {
    const sync = (): void => setRemainingMs(remainingUntil(targetEpochMs, serverOffsetMs));
    sync();
    const interval = window.setInterval(sync, 200);
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [serverOffsetMs, targetEpochMs]);

  return { remainingMs, isLive: remainingMs === 0 };
}
