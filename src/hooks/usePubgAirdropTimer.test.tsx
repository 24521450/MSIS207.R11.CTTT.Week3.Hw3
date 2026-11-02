import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePubgAirdropTimer } from "./usePubgAirdropTimer";

describe("usePubgAirdropTimer", () => {
  afterEach(() => vi.useRealTimers());

  it("syncs at mount and derives each tick from the deadline after clock jumps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const { result, unmount } = renderHook(() => usePubgAirdropTimer(3_000));
    expect(result.current).toEqual({ remainingMs: 2_000, isLive: false });

    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.remainingMs).toBe(1_800);
    act(() => {
      vi.setSystemTime(1_700);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.remainingMs).toBe(1_300);
    act(() => {
      vi.setSystemTime(8_000);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toEqual({ remainingMs: 0, isLive: true });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the server offset and resyncs immediately when the tab becomes visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { result } = renderHook(() => usePubgAirdropTimer(20_000, 2_000));
    expect(result.current.remainingMs).toBe(8_000);

    act(() => {
      vi.setSystemTime(25_000);
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.remainingMs).toBe(8_000);
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toEqual({ remainingMs: 0, isLive: true });
  });

  it("recomputes on target changes and removes timer and visibility listener on cleanup", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    const remove = vi.spyOn(document, "removeEventListener");
    const { result, rerender, unmount } = renderHook(
      ({ target }: { target: number }) => usePubgAirdropTimer(target),
      { initialProps: { target: 10_000 } },
    );
    expect(result.current.remainingMs).toBe(5_000);
    rerender({ target: 7_000 });
    expect(result.current.remainingMs).toBe(2_000);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
