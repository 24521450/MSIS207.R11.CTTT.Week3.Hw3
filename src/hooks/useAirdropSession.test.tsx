import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAirdropSession } from "./useAirdropSession";

describe("useAirdropSession", () => {
  afterEach(() => vi.useRealTimers());

  it("locks synchronously so two clicks before a render send only one request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useAirdropSession());
    const serviceClaim = vi.spyOn(result.current.service, "claim");
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.claim("drop-live");
      second = result.current.claim("drop-live");
    });
    expect(serviceClaim).toHaveBeenCalledTimes(1);
    expect(result.current.displayedStock["drop-live"]).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await Promise.all([first, second]);
    expect(result.current.snapshots["drop-live"]).toEqual({ stock: 2, version: 1 });
    expect(result.current.displayedStock["drop-live"]).toBe(2);
    expect(result.current.claims["drop-live"]?.status).toBe("success");
  });

  it("rolls back 409 from the service and does not add stock back blindly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useAirdropSession());
    act(() => result.current.setScenario("conflict"));
    let claim!: Promise<unknown>;
    act(() => { claim = result.current.claim("drop-live"); });
    expect(result.current.displayedStock["drop-live"]).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await claim;
    expect(result.current.snapshots["drop-live"]).toEqual({ stock: 0, version: 1 });
    expect(result.current.displayedStock["drop-live"]).toBe(0);
    expect(result.current.claims["drop-live"]?.status).toBe("conflict");
  });

  it("rolls back a temporary failure and permits a clean retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useAirdropSession());
    act(() => result.current.setScenario("temporary-error"));
    let first!: Promise<unknown>;
    act(() => { first = result.current.claim("drop-live"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await first;
    expect(result.current.displayedStock["drop-live"]).toBe(3);
    expect(result.current.claims["drop-live"]?.status).toBe("error");
    act(() => result.current.setScenario("success"));
    let retry!: Promise<unknown>;
    act(() => { retry = result.current.claim("drop-live"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    await retry;
    expect(result.current.displayedStock["drop-live"]).toBe(2);
    expect(result.current.claims["drop-live"]?.status).toBe("success");
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
