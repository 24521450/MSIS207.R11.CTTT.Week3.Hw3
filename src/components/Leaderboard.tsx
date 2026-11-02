import { useEffect, useMemo, useState } from "react";
import { SQUAD_SEEDS } from "../data/seedData";
import type { PubgVnSquadStanding } from "../domain/contracts";
import { sortStandings, type StandingSortKey } from "../domain/leaderboard";

const SORT_LABELS: Record<StandingSortKey, string> = {
  wwcdCount: "WWCD",
  placementPts: "Placement pts",
  killPts: "Kill pts",
};

export function Leaderboard() {
  const [standings, setStandings] = useState<readonly PubgVnSquadStanding[]>(SQUAD_SEEDS);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<StandingSortKey>("wwcdCount");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    let update = 0;
    const interval = window.setInterval(() => {
      const squadIndex = update % SQUAD_SEEDS.length;
      update += 1;
      setStandings((current) =>
        current.map((standing, index) =>
          index === squadIndex ? { ...standing, killPts: standing.killPts + 1 } : standing,
        ),
      );
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [paused]);

  const sorted = useMemo(
    () => sortStandings(standings, sortKey, direction, query),
    [direction, query, sortKey, standings],
  );

  return (
    <section className="panel leaderboard-panel" id="leaderboard" aria-labelledby="leaderboard-title">
      <div className="section-heading">
        <div>
          <div className="eyebrow"><span className="live-dot" /> DỮ LIỆU TRẬN ĐẤU</div>
          <h2 id="leaderboard-title">Bảng xếp hạng</h2>
        </div>
        <button className="subtle-button pause-button" type="button" onClick={() => setPaused((value) => !value)}>
          <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span> {paused ? "Tiếp tục" : "Tạm dừng"}
        </button>
      </div>
      <div className="table-toolbar">
        <label className="search-control">
          <span className="sr-only">Tìm đội trong bảng xếp hạng</span>
          <span aria-hidden="true" className="search-glyph">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm đội tuyển…" />
        </label>
        <label className="select-control">
          <span className="sr-only">Tiêu chí sắp xếp</span>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as StandingSortKey)}>
            {(Object.keys(SORT_LABELS) as StandingSortKey[]).map((key) => (
              <option key={key} value={key}>{SORT_LABELS[key]}</option>
            ))}
          </select>
        </label>
        <button
          className="icon-button sort-direction"
          type="button"
          aria-label={direction === "desc" ? "Đang giảm dần; đổi sang tăng dần" : "Đang tăng dần; đổi sang giảm dần"}
          title={direction === "desc" ? "Giảm dần" : "Tăng dần"}
          onClick={() => setDirection((value) => value === "desc" ? "asc" : "desc")}
        >
          {direction === "desc" ? "↓" : "↑"}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Điểm các đội tuyển PUBG Việt Nam</caption>
          <thead>
            <tr><th scope="col"># / ĐỘI</th><th scope="col">WWCD</th><th scope="col">PLACEMENT</th><th scope="col">KILL PTS</th></tr>
          </thead>
          <tbody>
            {sorted.map((standing, index) => (
              <tr key={standing.squadId}>
                <td><span className={`rank-number ${index === 0 ? "rank-first" : ""}`}>{String(index + 1).padStart(2, "0")}</span><span className="squad-mark">{standing.squadId.slice(0, 2)}</span><span className="squad-name">{standing.squadName}</span></td>
                <td><strong>{standing.wwcdCount}</strong></td>
                <td>{standing.placementPts}</td>
                <td>{standing.killPts.toString().padStart(2, "0")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <p className="empty-state table-empty">Không tìm thấy đội tuyển phù hợp.</p>}
      </div>
      <div className="table-footer"><span>Vòng chung kết · Erangel</span><span>{paused ? "Đã tạm dừng" : "Cập nhật mô phỏng mỗi 4 giây"}</span></div>
    </section>
  );
}
