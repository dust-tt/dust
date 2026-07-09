import type { AgentCartographyCoordinates } from "@app/types/api/assistant/cartography";

/**
 * The 9 agents we optimize the cartography for, grouped by theme. We want the
 * PCA projection to keep agents of the same group close together and far from
 * the other groups.
 */
export const GROUPS: Record<string, string[]> = {
  Finance: ["P3eDG5oH8a", "ww6gcIDP3E", "GborGtGKEt"],
  Engineering: ["unppcnu4ut", "U1B3dzDWmP", "PYwYFSRQi4"],
  Marketing: ["Mg2E6Edfow", "9XD9dibFZG", "OQhuKzqJp0"],
};

type Point = [number, number];

export interface GroupingScore {
  silhouette: number;
  intra: number;
  inter: number;
  perAgent: { sId: string; group: string; silhouette: number }[];
}

function euclidean(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Computes a clustering-quality score for our 9 grouped agents given their 2D
 * coordinates. Uses the mean silhouette score: for each agent, a = mean
 * distance to same-group agents, b = mean distance to the nearest other group,
 * and s = (b - a) / max(a, b). The overall score is the mean of s over all
 * agents, in [-1, 1] where higher is better (1 = perfectly separated groups).
 *
 * Also returns the raw intra-/inter-group mean distances for context.
 */
export function computeGroupingScore(
  coordinatesByAgentId: AgentCartographyCoordinates
): GroupingScore {
  const groupNames = Object.keys(GROUPS);

  const pointOf = (sId: string): Point | null => {
    const p = coordinatesByAgentId[sId];
    return p ? [p[0], p[1]] : null;
  };

  const perAgent: { sId: string; group: string; silhouette: number }[] = [];
  const intraDistances: number[] = [];
  const interDistances: number[] = [];

  for (const [group, ids] of Object.entries(GROUPS)) {
    for (const sId of ids) {
      const point = pointOf(sId);
      if (!point) {
        continue;
      }

      // a: mean distance to the other agents in the same group.
      const sameGroupDistances = ids
        .filter((other) => other !== sId)
        .map((other) => pointOf(other))
        .filter((p): p is Point => p !== null)
        .map((p) => euclidean(point, p));
      const a =
        sameGroupDistances.reduce((sum, d) => sum + d, 0) /
        (sameGroupDistances.length || 1);
      intraDistances.push(...sameGroupDistances);

      // b: min over other groups of the mean distance to that group.
      const otherGroupMeans = groupNames
        .filter((g) => g !== group)
        .map((g) => {
          const distances = GROUPS[g]
            .map((other) => pointOf(other))
            .filter((p): p is Point => p !== null)
            .map((p) => euclidean(point, p));
          interDistances.push(...distances);
          return (
            distances.reduce((sum, d) => sum + d, 0) / (distances.length || 1)
          );
        });
      const b = Math.min(...otherGroupMeans);

      const s = b === 0 && a === 0 ? 0 : (b - a) / Math.max(a, b);
      perAgent.push({ sId, group, silhouette: s });
    }
  }

  const mean = (values: number[]): number =>
    values.reduce((sum, v) => sum + v, 0) / (values.length || 1);

  return {
    silhouette: mean(perAgent.map((p) => p.silhouette)),
    intra: mean(intraDistances),
    inter: mean(interDistances),
    perAgent,
  };
}
