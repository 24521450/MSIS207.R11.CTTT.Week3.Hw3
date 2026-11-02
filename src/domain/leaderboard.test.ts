import { describe, expect, it } from "vitest";
import { SQUAD_SEEDS } from "../data/seedData";
import { sortStandings } from "./leaderboard";

describe("sortStandings", () => {
  it("uses default WWCD, placement, kill, then squad ID ordering without mutating the source", () => {
    const source = [...SQUAD_SEEDS];
    const before = source.slice();
    const sorted = sortStandings(source);
    expect(sorted.map((standing) => standing.squadId)).toEqual(["EXP", "CER", "ROY", "AGG"]);
    expect(source).toEqual(before);
  });

  it("applies search, selected sort and direction with stable ID ties", () => {
    expect(sortStandings(SQUAD_SEEDS, "killPts", "desc", "esports").map((item) => item.squadId)).toEqual(["ROY", "CER"]);
    const tied = [
      { squadId: "BBB", squadName: "Team B", wwcdCount: 2, placementPts: 30, killPts: 8 },
      { squadId: "AAA", squadName: "Team A", wwcdCount: 2, placementPts: 30, killPts: 8 },
    ];
    expect(sortStandings(tied).map((item) => item.squadId)).toEqual(["AAA", "BBB"]);
    expect(sortStandings(tied, "wwcdCount", "asc").map((item) => item.squadId)).toEqual(["AAA", "BBB"]);
  });
});
