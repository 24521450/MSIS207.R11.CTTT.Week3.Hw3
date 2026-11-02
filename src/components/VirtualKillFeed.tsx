import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SQUAD_SEEDS } from "../data/seedData";
import type { KillFeedEvent } from "../domain/contracts";

const ROW_HEIGHT = 44;
const OVERSCAN = 8;
const VIEWPORT_HEIGHT = 396;

function timeLabel(epochMs: number): string {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(epochMs);
}

export function VirtualKillFeed({ events }: { readonly events: readonly KillFeedEvent[] }) {
  const [squadId, setSquadId] = useState("all");
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(VIEWPORT_HEIGHT);
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousRows = useRef<{ ids: readonly string[]; scrollTop: number; squadId: string; query: string }>({
    ids: [], scrollTop: 0, squadId: "all", query: "",
  });

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
    return events.filter((event) =>
      (squadId === "all" || event.squadId === squadId) &&
      event.content.toLocaleLowerCase("vi-VN").includes(normalizedQuery),
    );
  }, [events, query, squadId]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = (): void => setViewportHeight(element.clientHeight || VIEWPORT_HEIGHT);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    const prior = previousRows.current;
    const filterChanged = prior.squadId !== squadId || prior.query !== query;
    let nextScrollTop = element?.scrollTop ?? scrollTop;
    if (filterChanged) {
      nextScrollTop = 0;
    } else if (prior.ids.length > 0 && filtered.length > 0 && prior.ids[0] !== filtered[0]?.id) {
      const oldAnchorIndex = Math.min(Math.floor(prior.scrollTop / ROW_HEIGHT), prior.ids.length - 1);
      const anchorId = prior.ids[oldAnchorIndex];
      const newAnchorIndex = anchorId ? filtered.findIndex((event) => event.id === anchorId) : -1;
      const offsetWithinRow = prior.scrollTop % ROW_HEIGHT;
      nextScrollTop = newAnchorIndex >= 0
        ? newAnchorIndex * ROW_HEIGHT + offsetWithinRow
        : Math.max(0, prior.scrollTop - Math.max(0, prior.ids.length - filtered.length) * ROW_HEIGHT);
      if (element) element.scrollTop = nextScrollTop;
    }
    const maxScroll = Math.max(0, filtered.length * ROW_HEIGHT - viewportHeight);
    nextScrollTop = Math.min(nextScrollTop, maxScroll);
    if (element && element.scrollTop !== nextScrollTop) element.scrollTop = nextScrollTop;
    if (Math.abs(scrollTop - nextScrollTop) > 0.5) setScrollTop(nextScrollTop);
    previousRows.current = {
      ids: filtered.map((event) => event.id),
      scrollTop: nextScrollTop,
      squadId,
      query,
    };
  }, [filtered, query, scrollTop, squadId, viewportHeight]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const renderCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const visibleRows = filtered.slice(startIndex, startIndex + renderCount);

  return (
    <section className="panel feed-panel" id="kill-feed" aria-labelledby="feed-title">
      <div className="section-heading feed-heading">
        <div>
          <div className="eyebrow"><span className="feed-wave" aria-hidden="true">≋</span> TRUNG TÂM TÁC CHIẾN</div>
          <h2 id="feed-title">Kill feed <span className="feed-count">{filtered.length.toLocaleString("vi-VN")}</span></h2>
        </div>
        <span className="live-chip"><span className="live-dot" /> LIVE</span>
      </div>
      <div className="feed-toolbar">
        <label className="select-control">
          <span className="sr-only">Lọc kill feed theo đội</span>
          <select aria-label="Lọc kill feed theo đội" value={squadId} onChange={(event) => setSquadId(event.target.value)}>
            <option value="all">Tất cả đội</option>
            {SQUAD_SEEDS.map((squad) => <option key={squad.squadId} value={squad.squadId}>{squad.squadName}</option>)}
          </select>
        </label>
        <label className="search-control feed-search">
          <span className="sr-only">Tìm nội dung kill feed</span>
          <span aria-hidden="true" className="search-glyph">⌕</span>
          <input aria-label="Tìm nội dung kill feed" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm sự kiện…" />
        </label>
      </div>
      <div
        className="virtual-viewport"
        ref={viewportRef}
        data-testid="kill-feed-viewport"
        tabIndex={0}
        aria-label="Danh sách kill feed, dùng phím mũi tên để cuộn"
        onScroll={(event) => {
          const element = event.currentTarget;
          setScrollTop(element.scrollTop);
          previousRows.current = { ...previousRows.current, scrollTop: element.scrollTop };
        }}
      >
        {filtered.length === 0 ? (
          <p className="empty-state feed-empty">Không có sự kiện phù hợp với bộ lọc này.</p>
        ) : (
          <div className="virtual-spacer" style={{ height: filtered.length * ROW_HEIGHT }} role="list">
            {visibleRows.map((event, index) => (
              <div
                className="feed-row"
                key={event.id}
                role="listitem"
                data-testid="kill-feed-row"
                data-event-id={event.id}
                style={{ top: (startIndex + index) * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                <time className="feed-time" dateTime={new Date(event.occurredAtEpochMs).toISOString()}>{timeLabel(event.occurredAtEpochMs)}</time>
                <span className="feed-team-mark">{event.squadId.slice(0, 2)}</span>
                <span className="feed-event"><strong>{event.squadName}</strong> {event.content.replace(`${event.squadName} `, "")}</span>
                <span className="feed-arrow" aria-hidden="true">↗</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="table-footer"><span>Windowing · {visibleRows.length} dòng đang hiển thị</span><span>Nguồn mô phỏng · tối đa 10.000 sự kiện</span></div>
    </section>
  );
}
