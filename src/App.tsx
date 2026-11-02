import { useEffect, useMemo, useState } from "react";
import { Leaderboard } from "./components/Leaderboard";
import { VirtualKillFeed } from "./components/VirtualKillFeed";
import { LIVE_FEED_LIMIT, SEEDED_KILL_FEED, SQUAD_SEEDS } from "./data/seedData";
import { formatVnd, getDropPhase } from "./domain/airdrop";
import type { ClaimScenario, DropPhase, KillFeedEvent, PubgCrateDrop } from "./domain/contracts";
import { useAirdropSession } from "./hooks/useAirdropSession";
import { usePubgAirdropTimer } from "./hooks/usePubgAirdropTimer";
import "./App.css";

const SERVER_OFFSET_MS = 0;

function formatClock(remainingMs: number): string {
  const wholeSeconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function phaseText(phase: DropPhase): string {
  return {
    WARMUP: "SẮP MỞ",
    AIRDROP_LIVE: "ĐANG MỞ",
    LOOTED_OUT: "HẾT HÀNG",
    EXPIRED: "ĐÃ ĐÓNG",
  }[phase];
}

function phaseClass(phase: DropPhase): string {
  return {
    WARMUP: "phase-warmup",
    AIRDROP_LIVE: "phase-live",
    LOOTED_OUT: "phase-empty",
    EXPIRED: "phase-expired",
  }[phase];
}

function useLiveKillFeed() {
  const [events, setEvents] = useState<readonly KillFeedEvent[]>(SEEDED_KILL_FEED);
  useEffect(() => {
    let sequence = 0;
    const interval = window.setInterval(() => {
      const squad = SQUAD_SEEDS[sequence % SQUAD_SEEDS.length]!;
      const next: KillFeedEvent = {
        id: `live-${sequence.toString().padStart(5, "0")}`,
        squadId: squad.squadId,
        squadName: squad.squadName,
        content: `${squad.squadName} xoay vòng an toàn trong mô phỏng trực tiếp`,
        occurredAtEpochMs: Date.now(),
      };
      sequence += 1;
      setEvents((current) => [...current, next].slice(-LIVE_FEED_LIMIT));
    }, 6_000);
    return () => window.clearInterval(interval);
  }, []);
  return events;
}

function DropCard({ drop, stock, phase, claimState, onClaim }: {
  readonly drop: PubgCrateDrop;
  readonly stock: number;
  readonly phase: DropPhase;
  readonly claimState: { readonly status: string; readonly message: string } | undefined;
  readonly onClaim: (dropId: string) => void;
}) {
  const targetEpochMs = phase === "WARMUP" ? drop.dropEpochMs : drop.expiresAtEpochMs;
  const { remainingMs } = usePubgAirdropTimer(targetEpochMs, SERVER_OFFSET_MS);
  const claimDisabled = phase !== "AIRDROP_LIVE" || claimState?.status === "pending";
  return (
    <article className={`drop-card ${phase === "AIRDROP_LIVE" ? "drop-card-active" : ""}`} data-testid={`drop-${drop.id}`}>
      <div className="drop-card-top">
        <span className={`phase-badge ${phaseClass(phase)}`}><span className="phase-dot" />{phaseText(phase)}</span>
        <span className="drop-stock"><i aria-hidden="true">▧</i> {stock} <span>còn lại</span></span>
      </div>
      <div className="crate-illustration" aria-hidden="true">
        <span className="crate-glow" />
        <svg viewBox="0 0 150 128" className="crate-svg">
          <path d="M28 42 75 19l47 23v50l-47 24-47-24z" fill="#d78b2d" stroke="#ffd27c" strokeWidth="2" />
          <path d="m28 42 47 24 47-24M75 66v50M45 33l48 26v52M105 33 57 59" fill="none" stroke="#442d17" strokeWidth="5" />
          <path d="m39 47 36 18 36-18v34L75 99 39 81z" fill="#f3b249" opacity=".76" />
          <path d="M59 56 75 48l16 8-16 9z" fill="#fff0c6" opacity=".75" />
          <path d="M62 86h26" stroke="#fff0c6" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      <div className="drop-copy">
        <div className="drop-label">AIRDROP · #{drop.id === "drop-live" ? "02" : drop.id === "drop-looted" ? "03" : "01"}</div>
        <h3>{drop.title}</h3>
        <div className="drop-price">{formatVnd(drop.priceVnd)}</div>
      </div>
      <div className="drop-countdown">
        <span>{phase === "WARMUP" ? "MỞ TIẾP TẾ SAU" : phase === "AIRDROP_LIVE" ? "ĐÓNG TIẾP TẾ SAU" : "TRẠNG THÁI"}</span>
        <strong>{phase === "WARMUP" || phase === "AIRDROP_LIVE" ? formatClock(remainingMs) : phaseText(phase)}</strong>
      </div>
      <button className="claim-button" type="button" disabled={claimDisabled} onClick={() => onClaim(drop.id)}>
        {claimState?.status === "pending" ? <><span className="button-spinner" aria-hidden="true" /> Đang xác nhận…</> : phase === "AIRDROP_LIVE" ? <>NHẬN AIRDROP <span aria-hidden="true">↗</span></> : phase === "WARMUP" ? "CHỜ MỞ ĐỢT" : phase === "LOOTED_OUT" ? "ĐÃ HẾT HÀNG" : "ĐỢT ĐÃ ĐÓNG"}
      </button>
      <p className={`claim-message claim-${claimState?.status ?? "idle"}`} aria-live="polite" aria-atomic="true">
        {claimState?.message || (phase === "AIRDROP_LIVE" ? "Cơ hội giới hạn · xác nhận tức thì trong demo" : "")}
      </p>
    </article>
  );
}

function App() {
  const { drops, snapshots, displayedStock, claims, scenario, setScenario, claim, reset } = useAirdropSession(SERVER_OFFSET_MS);
  const [now, setNow] = useState(() => Date.now() + SERVER_OFFSET_MS);
  const events = useLiveKillFeed();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now() + SERVER_OFFSET_MS), 200);
    const handleVisibility = (): void => {
      if (document.visibilityState === "visible") setNow(Date.now() + SERVER_OFFSET_MS);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const phaseById = useMemo(() => {
    const result: Record<string, DropPhase> = {};
    for (const drop of drops) {
      result[drop.id] = getDropPhase(drop, snapshots[drop.id]?.stock ?? 0, now);
    }
    return result;
  }, [drops, now, snapshots]);
  const liveCount = Object.values(phaseById).filter((phase) => phase === "AIRDROP_LIVE").length;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="PUBG Vietnam Airdrop Arena, đầu trang">
          <span className="brand-emblem" aria-hidden="true"><span>PGC</span></span>
          <span className="brand-wordmark"><strong>BATTLEGROUNDS</strong><span>VIETNAM · CHAMPIONSHIP</span></span>
        </a>
        <nav className="main-nav" aria-label="Điều hướng chính">
          <a href="#leaderboard">XẾP HẠNG</a><a href="#airdrop">AIRDROP</a><a href="#kill-feed">KILL FEED</a>
        </nav>
        <div className="topbar-right"><span className="demo-tag"><span className="demo-tag-dot" /> DEMO MÔ PHỎNG</span><span className="user-mark" aria-label="Hồ sơ người chơi">Q</span></div>
      </header>

      <section className="hero" id="top">
        <div className="hero-texture" aria-hidden="true"><span className="map-ring ring-one" /><span className="map-ring ring-two" /><span className="map-grid" /></div>
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow"><span className="season-mark">S3</span> MÙA GIẢI 2026 <span className="eyebrow-divider" /> VÒNG CHUNG KẾT</div>
          <h1>DROP IN.<br /><span>RISE ABOVE.</span></h1>
          <p>Đường đến ngôi vương bắt đầu từ đây.<br />Theo dõi diễn biến và săn tiếp tế ngay trong đấu trường.</p>
          <a className="hero-cta" href="#airdrop">KHÁM PHÁ ĐẤU TRƯỜNG <span aria-hidden="true">↘</span></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-sun" />
          <div className="hero-plane"><span />✈</div>
          <div className="hero-parachute"><span className="parachute-canopy" /><span className="parachute-lines" /><span className="parachute-crate" /></div>
          <div className="hero-horizon" />
          <span className="hero-coordinate">16°03' N&nbsp; 108°12' E</span>
        </div>
        <div className="hero-bottom"><span><i className="live-dot" /> TRỰC TIẾP TỪ ERANGEL</span><span>ĐÀ NẴNG, VIỆT NAM&nbsp; · &nbsp;02.11.2026</span></div>
      </section>

      <section className="stats-strip" aria-label="Tổng quan trận đấu">
        <div className="stat-block"><span>ĐỘI TUYỂN</span><strong>04</strong><small>đại diện Việt Nam</small></div>
        <div className="stat-block"><span>ĐỢT TIẾP TẾ ĐANG MỞ</span><strong>{String(liveCount).padStart(2, "0")}<i className="stat-live-pip" /></strong><small>có thể tham gia ngay</small></div>
        <div className="stat-block"><span>KILL FEED</span><strong>{events.length.toLocaleString("vi-VN")}</strong><small>sự kiện mô phỏng</small></div>
        <div className="stats-caption"><span className="crosshair" aria-hidden="true">⌖</span><span>THE LAST CIRCLE<br /><b>STARTS HERE</b></span></div>
      </section>

      <div className="content-grid">
        <div className="main-column">
          <Leaderboard />
          <VirtualKillFeed events={events} />
        </div>

        <aside className="airdrop-column" id="airdrop" aria-labelledby="airdrop-title">
          <div className="airdrop-heading">
            <div className="eyebrow"><span className="airdrop-icon" aria-hidden="true">✦</span> TIẾP TẾ CHIẾN TRƯỜNG</div>
            <h2 id="airdrop-title">Airdrop<br /><span>Arena</span></h2>
            <p>Chọn thời điểm. Giữ chiến lợi phẩm.</p>
          </div>
          <div className="scenario-control">
            <label htmlFor="claim-scenario">KỊCH BẢN SERVICE</label>
            <div className="scenario-select-wrap"><select id="claim-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as ClaimScenario)}>
              <option value="success">01 · Nhận thành công</option>
              <option value="conflict">02 · Đối thủ nhận hết (409)</option>
              <option value="temporary-error">03 · Lỗi tạm thời · có thể thử lại</option>
            </select><span aria-hidden="true">⌄</span></div>
            <p>Kịch bản cố định để kiểm thử; không có request backend thật.</p>
          </div>
          <div className="drop-list">
            {drops.map((drop) => (
              <DropCard
                key={drop.id}
                drop={drop}
                stock={displayedStock[drop.id] ?? 0}
                phase={getDropPhase(drop, snapshots[drop.id]?.stock ?? 0, now)}
                claimState={claims[drop.id]}
                onClaim={(dropId) => { void claim(dropId); }}
              />
            ))}
          </div>
          <button className="reset-button" type="button" onClick={reset}><span aria-hidden="true">↻</span> RESET DEMO</button>
          <div className="mock-note"><span aria-hidden="true">ⓘ</span><p>Đây là <strong>demo học tập</strong> với dữ liệu mô phỏng. Không phải website chính thức của KRAFTON / PUBG; không thanh toán thật, không backend và không đồng bộ kho giữa các trình duyệt.</p></div>
        </aside>
      </div>

      <footer className="site-footer"><div className="footer-brand"><span className="brand-emblem footer-emblem" aria-hidden="true"><span>PGC</span></span><span>BATTLEGROUNDS · VIETNAM</span></div><span>GIAO DIỆN MÔ PHỎNG PHỤC VỤ HỌC TẬP · 2026</span><a href="#top">LÊN ĐẦU TRANG ↑</a></footer>
    </main>
  );
}

export default App;
