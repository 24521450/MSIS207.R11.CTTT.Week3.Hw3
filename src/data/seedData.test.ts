import { describe, expect, it } from "vitest";
import { createSeedKillFeed, LIVE_FEED_LIMIT, SQUAD_SEEDS } from "./seedData";

describe("deterministic seed data", () => {
  it("contains the four required squads and creates 10,000 repeatable, stable event IDs", () => {
    expect(SQUAD_SEEDS.map((squad) => squad.squadName)).toEqual([
      "The Expendables", "Cerberus Esports", "Roy Esports", "AGG",
    ]);
    const first = createSeedKillFeed();
    const second = createSeedKillFeed();
    expect(first).toHaveLength(10_000);
    expect(LIVE_FEED_LIMIT).toBe(10_000);
    expect(new Set(first.map((event) => event.id)).size).toBe(10_000);
    expect(first.slice(0, 20)).toEqual(second.slice(0, 20));
  });
});
