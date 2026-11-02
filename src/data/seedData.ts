import type { KillFeedEvent, PubgVnSquadStanding } from "../domain/contracts";

export const SQUAD_SEEDS: readonly PubgVnSquadStanding[] = Object.freeze([
  { squadId: "EXP", squadName: "The Expendables", wwcdCount: 4, placementPts: 62, killPts: 48 },
  { squadId: "CER", squadName: "Cerberus Esports", wwcdCount: 3, placementPts: 59, killPts: 53 },
  { squadId: "ROY", squadName: "Roy Esports", wwcdCount: 3, placementPts: 54, killPts: 57 },
  { squadId: "AGG", squadName: "AGG", wwcdCount: 2, placementPts: 58, killPts: 47 },
]);

const FEED_BASE_EPOCH = 1_793_610_000_000;
const FEED_TEMPLATES = [
  "hạ gục đối thủ bằng M416",
  "giành lợi thế giao tranh tại Erangel",
  "đẩy xe vào vòng bo an toàn",
  "kết thúc pha đấu tay đôi với Beryl M762",
  "phá vỡ thế thủ tại khu nhà School",
  "xoay vòng chiến thuật qua Military Island",
  "ghi thêm điểm hạ gục trong vòng bo 5",
  "giữ vị trí cao và kiểm soát đường vào",
] as const;

/** A repeatable 10,000-row seed for stable demos and predictable test cases. */
export function createSeedKillFeed(): readonly KillFeedEvent[] {
  const squads = SQUAD_SEEDS;
  return Array.from({ length: 10_000 }, (_, index) => {
    const squad = squads[(index * 7 + Math.floor(index / 11)) % squads.length]!;
    const template = FEED_TEMPLATES[(index * 5 + Math.floor(index / 17)) % FEED_TEMPLATES.length]!;
    return Object.freeze({
      id: `feed-${String(index + 1).padStart(5, "0")}`,
      squadId: squad.squadId,
      squadName: squad.squadName,
      content: `${squad.squadName} ${template}`,
      occurredAtEpochMs: FEED_BASE_EPOCH + index * 4_500,
    });
  });
}

export const SEEDED_KILL_FEED = createSeedKillFeed();
export const LIVE_FEED_LIMIT = 10_000;
