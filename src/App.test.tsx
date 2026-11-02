import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App phase rendering", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps a last unit live while its optimistic claim is pending and closes after service confirmation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    render(<App />);
    const card = within(screen.getByTestId("drop-drop-live"));
    const claimButton = card.getByRole("button", { name: /NHẬN AIRDROP/ });

    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(claimButton);
      await vi.advanceTimersByTimeAsync(650);
    }
    expect(card.getByText("1", { selector: ".drop-stock" })).toBeInTheDocument();

    fireEvent.click(claimButton);
    expect(card.getByText("ĐANG MỞ")).toBeInTheDocument();
    expect(card.getByText("0", { selector: ".drop-stock" })).toBeInTheDocument();
    expect(card.getByText("Đang xác nhận với kho mô phỏng…")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(650);
    expect(card.getByText("HẾT HÀNG", { selector: ".phase-badge" })).toBeInTheDocument();
  });
});
