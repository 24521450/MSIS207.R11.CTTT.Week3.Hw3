import type { PubgVnSquadStanding } from "./contracts";

export type StandingSortKey = "wwcdCount" | "placementPts" | "killPts";

export function sortStandings(
  standings: readonly PubgVnSquadStanding[],
  key: StandingSortKey = "wwcdCount",
  direction: "asc" | "desc" = "desc",
  query = "",
): PubgVnSquadStanding[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
  const directionFactor = direction === "asc" ? 1 : -1;
  return standings
    .filter((standing) =>
      `${standing.squadName} ${standing.squadId}`.toLocaleLowerCase("vi-VN").includes(normalizedQuery),
    )
    .slice()
    .sort((left, right) => {
      const primary = (left[key] - right[key]) * directionFactor;
      if (primary !== 0) return primary;
      for (const fallback of ["wwcdCount", "placementPts", "killPts"] as const) {
        if (fallback === key) continue;
        const difference = right[fallback] - left[fallback];
        if (difference !== 0) return difference;
      }
      return left.squadId.localeCompare(right.squadId);
    });
}
