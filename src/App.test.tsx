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

  it("distinguishes PVS VIP tickets and G-Coin crates and preserves pending through scenario changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    render(<App />);
    const ticketElement = screen.getByTestId("drop-drop-live");
    const ticketCard = within(ticketElement);
    const gcoinElement = screen.getByTestId("drop-drop-gcoin");
    const gcoinCard = within(gcoinElement);

    expect(ticketCard.getByRole("heading", { name: "PVS Grand Finals VIP Tickets" })).toBeInTheDocument();
    expect(ticketCard.getByText("1 vé VIP mô phỏng")).toBeInTheDocument();
    expect(ticketCard.getByText("ĐANG MỞ")).toBeInTheDocument();
    expect(ticketElement.querySelector(".drop-countdown strong")).toHaveTextContent("08:00");
    expect(ticketElement.querySelector(".ticket-illustration")).toBeInTheDocument();
    expect(gcoinCard.getByRole("heading", { name: "G-Coin Crate" })).toBeInTheDocument();
    expect(gcoinCard.getByText("2.000 G-Coin mô phỏng")).toBeInTheDocument();
    expect(gcoinCard.getByText("ĐANG MỞ")).toBeInTheDocument();
    expect(gcoinElement.querySelector(".drop-countdown strong")).toHaveTextContent("08:00");
    expect(gcoinElement.querySelector(".crate-illustration")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("KỊCH BẢN SERVICE"), { target: { value: "temporary-error" } });
    const claimButton = ticketCard.getByRole("button", { name: /NHẬN AIRDROP/ });
    fireEvent.click(claimButton);
    expect(claimButton).toBeDisabled();
    expect(claimButton).toHaveTextContent("Đang xác nhận");
    expect(ticketCard.getByText("Đang xác nhận với kho mô phỏng…")).toBeInTheDocument();
    expect(ticketCard.getByText("2", { selector: ".drop-stock" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("KỊCH BẢN SERVICE"), { target: { value: "success" } });
    expect(claimButton).toBeDisabled();
    expect(claimButton).toHaveTextContent("Đang xác nhận");
    expect(ticketCard.getByText("Đang xác nhận với kho mô phỏng…")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(650);
    expect(ticketCard.getByText("Lỗi tạm thời. Tồn kho đã hoàn tác; bạn có thể thử lại.")).toBeInTheDocument();
    expect(ticketCard.getByText("3", { selector: ".drop-stock" })).toBeInTheDocument();
    fireEvent.click(claimButton);
    await vi.advanceTimersByTimeAsync(650);
    expect(ticketCard.getByText("Đã nhận airdrop thành công.")).toBeInTheDocument();
    expect(ticketCard.getByText("2", { selector: ".drop-stock" })).toBeInTheDocument();
  });
});
