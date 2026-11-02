import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEEDED_KILL_FEED } from "../data/seedData";
import { VirtualKillFeed } from "./VirtualKillFeed";

describe("VirtualKillFeed", () => {
  it("windows the 10,000-event list at the first, middle and final scroll positions", () => {
    render(<VirtualKillFeed events={SEEDED_KILL_FEED} />);
    const viewport = screen.getByTestId("kill-feed-viewport");
    const initialRows = screen.getAllByTestId("kill-feed-row");
    expect(initialRows.length).toBeLessThanOrEqual(26);
    expect(initialRows[0]).toHaveAttribute("data-event-id", "feed-00001");

    viewport.scrollTop = 220_000;
    fireEvent.scroll(viewport);
    const middleRows = screen.getAllByTestId("kill-feed-row");
    expect(middleRows.length).toBeLessThanOrEqual(26);
    expect(middleRows[0]).toHaveAttribute("data-event-id", "feed-04993");

    viewport.scrollTop = 1_000_000;
    fireEvent.scroll(viewport);
    const endRows = screen.getAllByTestId("kill-feed-row");
    expect(endRows.length).toBeLessThanOrEqual(26);
    expect(endRows.some((row) => row.getAttribute("data-event-id") === "feed-10000")).toBe(true);
  });

  it("resets scroll after filtering and shows an empty state for no matches", () => {
    render(<VirtualKillFeed events={SEEDED_KILL_FEED} />);
    const viewport = screen.getByTestId("kill-feed-viewport");
    viewport.scrollTop = 44_000;
    fireEvent.scroll(viewport);
    fireEvent.change(screen.getByLabelText("Lọc kill feed theo đội"), { target: { value: "AGG" } });
    expect(viewport.scrollTop).toBe(0);
    const first = screen.getAllByTestId("kill-feed-row")[0]!;
    const firstId = first.getAttribute("data-event-id");
    const firstEvent = SEEDED_KILL_FEED.find((event) => event.id === firstId);
    expect(firstEvent?.squadId).toBe("AGG");
    expect(screen.getAllByTestId("kill-feed-row").length).toBeLessThanOrEqual(26);

    fireEvent.change(screen.getByLabelText("Tìm nội dung kill feed"), { target: { value: "không tồn tại trong trận" } });
    expect(screen.getByText("Không có sự kiện phù hợp với bộ lọc này.")).toBeInTheDocument();
    expect(screen.queryByTestId("kill-feed-row")).not.toBeInTheDocument();
    expect(within(viewport).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("preserves the visible event anchor when the live feed trims its oldest row", () => {
    const { rerender } = render(<VirtualKillFeed events={SEEDED_KILL_FEED} />);
    const viewport = screen.getByTestId("kill-feed-viewport");
    viewport.scrollTop = 220_000;
    fireEvent.scroll(viewport);
    const oldIndex = Math.floor(viewport.scrollTop / 44);
    const anchorId = SEEDED_KILL_FEED[oldIndex]?.id;
    const nextEvents = [
      ...SEEDED_KILL_FEED.slice(1),
      { ...SEEDED_KILL_FEED[0]!, id: "live-new", occurredAtEpochMs: Date.now() },
    ];

    rerender(<VirtualKillFeed events={nextEvents} />);

    expect(nextEvents[Math.floor(viewport.scrollTop / 44)]?.id).toBe(anchorId);
    expect(viewport.scrollTop).toBe(220_000 - 44);
    expect(screen.getAllByTestId("kill-feed-row").length).toBeLessThanOrEqual(26);
  });
});
