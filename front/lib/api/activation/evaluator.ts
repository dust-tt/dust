import { fetchUserDayCells } from "@app/lib/api/activation/queries/user_day_cells";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import moment from "moment-timezone";

// A user is ACTIVATED when, over the trailing TRAILING_WINDOW_DAYS days, they
// have ≥MIN_HVUC_DAYS high value use case (HVUC) days spanning ≥MIN_DISTINCT_WEEKS
// distinct weeks (Monday-based, UTC).
//
// - HVUC day = a DAU day (≥1 human-initiated organic message) on which the user
//   also had ≥1 succeeded advanced-cost tool call, frame touch
//   (interactive_content), or run_agent.

export const MIN_HVUC_DAYS = 6;
export const MIN_DISTINCT_WEEKS = 3;
export const TRAILING_WINDOW_DAYS = 28;

export interface ActivationEvidence {
  // ISO dates (YYYY-MM-DD, UTC) of the qualifying HVUC days.
  qualifyingDays: string[];
  // Distinct Monday-based UTC ISO weeks spanned by the qualifying days.
  qualifyingWeeks: string[];
}

export interface ActivationResult {
  activated: boolean;
  hvucDays: number;
  hvucWeeks: number;
  minHvucDays: number;
  minDistinctWeeks: number;
  trailingWindowDays: number;
  evidence: ActivationEvidence;
}

// One (user, day) cell: was the user a DAU that day, and did they have an HVUC
// signal.
export interface UserDayCell {
  userId: string;
  // Epoch millis at the start of the UTC day.
  dayMs: number;
  isDau: boolean;
  isHvuc: boolean;
}

function isoWeekKey(dayMs: number): string {
  const m = moment.utc(dayMs);
  return `${m.isoWeekYear()}-W${String(m.isoWeek()).padStart(2, "0")}`;
}

/**
 * Computes a user's activation verdict from their per-day cells over the trailing
 * window. A day qualifies when the user was a DAU that day AND had an HVUC signal.
 * Activation requires ≥MIN_HVUC_DAYS qualifying days spanning ≥MIN_DISTINCT_WEEKS
 * distinct Monday-based UTC weeks.
 */
export function computeActivationFromCells(
  cells: UserDayCell[]
): ActivationResult {
  const qualifyingDays: string[] = [];
  const weeks = new Set<string>();

  for (const cell of cells) {
    if (!cell.isDau || !cell.isHvuc) {
      continue;
    }
    qualifyingDays.push(moment.utc(cell.dayMs).format("YYYY-MM-DD"));
    weeks.add(isoWeekKey(cell.dayMs));
  }

  const hvucDays = qualifyingDays.length;
  const hvucWeeks = weeks.size;
  const activated =
    hvucDays >= MIN_HVUC_DAYS && hvucWeeks >= MIN_DISTINCT_WEEKS;

  return {
    activated,
    hvucDays,
    hvucWeeks,
    minHvucDays: MIN_HVUC_DAYS,
    minDistinctWeeks: MIN_DISTINCT_WEEKS,
    trailingWindowDays: TRAILING_WINDOW_DAYS,
    evidence: {
      qualifyingDays: qualifyingDays.sort(),
      qualifyingWeeks: [...weeks].sort(),
    },
  };
}

/**
 * Batch-evaluates activation for a set of users in one workspace. Fetches per-
 * (user, day) facts with one Elasticsearch aggregation (not one query per user),
 * then applies the day/week thresholds.
 */
export async function evaluateActivation(
  auth: Authenticator,
  {
    workspaceId,
    userIds,
    asOf = new Date(),
  }: {
    workspaceId: string;
    userIds: string[];
    asOf?: Date;
  }
): Promise<Result<Map<string, ActivationResult>, Error>> {
  // The ES query is scoped by workspace_id; guard that it matches the caller's
  // authenticated workspace so a mismatched auth can't read another workspace.
  assert(
    auth.getNonNullableWorkspace().sId === workspaceId,
    "evaluateActivation: workspaceId must match the authenticated workspace"
  );

  const windowStart = moment
    .utc(asOf)
    .subtract(TRAILING_WINDOW_DAYS, "days")
    .toISOString();
  const windowEnd = moment.utc(asOf).toISOString();

  const factsResult = await fetchUserDayCells({
    workspaceId,
    userIds,
    windowStart,
    windowEnd,
  });
  if (factsResult.isErr()) {
    return new Err(factsResult.error);
  }

  const results = new Map<string, ActivationResult>();
  for (const [userId, facts] of factsResult.value) {
    results.set(userId, computeActivationFromCells(facts));
  }

  return new Ok(results);
}
