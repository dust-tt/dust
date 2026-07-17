import {
  classifyStakeOrFrameTool,
  type StakeOrFrameSignal,
} from "@app/lib/api/activation/stake_and_frame_classification";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { USAGE_ORIGINS_CLASSIFICATION } from "@app/lib/api/programmatic_usage/common";
import type { Authenticator } from "@app/lib/auth";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";
import moment from "moment-timezone";

// A user is ACTIVATED when, over the trailing TRAILING_WINDOW_DAYS days, they have ≥MIN_HVUC_DAYS organic
// high value use case (HVUC) days spanning ≥MIN_DISTINCT_WEEKS distinct weeks (Monday-based, UTC).
//
// - HVUC day = ≥1 high-value message that day — staked tool, frame create/edit,
//   orchestration (run_agent), or unsupervised (triggered) — on a day the user
//   is also a daily active user (DAU) (≥1 human-initiated message; a background
//   trigger alone never makes a user active). We are using a tool that has a "stake"
//   as a heuristic to classify tools that are more than basic read tools. It is acknowledged
//   that this is not a perfect classification, but it avoids a static classification list of tools.
// - Organic = excludes programmatic origins

export const MIN_HVUC_DAYS = 6;
export const MIN_DISTINCT_WEEKS = 3;
export const TRAILING_WINDOW_DAYS = 28;

const RUN_AGENT_SERVER_NAME = "run_agent";
const TRIGGERED_ORIGIN: UserMessageOrigin = "triggered";

// Safety bounds on ElasticSearch calls. It is theoretically possible that a workspace requires more than 100 users to be evaluated at once.
// This is unlikely, but ok as worst case scenario is a false "non-activation" verdict.
const ELASTICSEARCH_MAX_USERS_PER_CALL = 100;
const COMPOSITE_PAGE_SIZE =
  ELASTICSEARCH_MAX_USERS_PER_CALL * TRAILING_WINDOW_DAYS;
// One page always suffices; +1 slack for the trailing empty after_key round
// trip. Reaching this is an invariant violation.
const MAX_COMPOSITE_PAGES = 2;

// Programmatic origins are excluded outright
export const PROGRAMMATIC_ORIGINS: UserMessageOrigin[] = (
  Object.keys(USAGE_ORIGINS_CLASSIFICATION) as UserMessageOrigin[]
).filter((origin) => USAGE_ORIGINS_CLASSIFICATION[origin] === "programmatic");

// Human-initiated origins that make a user a DAU. Organic ("user") origins minus
// `triggered`: a background trigger firing is organic but is not human-initiated,
// so it can never make the day a DAU day on its own.
export const HUMAN_ORIGINS: UserMessageOrigin[] = (
  Object.keys(USAGE_ORIGINS_CLASSIFICATION) as UserMessageOrigin[]
).filter(
  (origin) =>
    USAGE_ORIGINS_CLASSIFICATION[origin] === "user" &&
    origin !== TRIGGERED_ORIGIN
);

export type ActivationCategory =
  | StakeOrFrameSignal
  | "IS_ORCHESTRATION"
  | "IS_UNSUPERVISED";

export interface ActivationEvidence {
  // ISO dates (YYYY-MM-DD, UTC) of the qualifying HVUC days.
  qualifyingDays: string[];
  // Distinct Monday-based UTC ISO weeks spanned by the qualifying days.
  qualifyingWeeks: string[];
  // High-value categories observed across qualifying days (staked tool, frame,
  // orchestration, unsupervised).
  categories: ActivationCategory[];
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

// One (user, day) cell with its high-value signals, produced from the ES
// aggregation.
export interface UserDayCell {
  userId: string;
  // Epoch millis at the start of the UTC day.
  dayMs: number;
  isDau: boolean;
  categories: ActivationCategory[];
}

function isoWeekKey(dayMs: number): string {
  const m = moment.utc(dayMs);
  return `${m.isoWeekYear()}-W${String(m.isoWeek()).padStart(2, "0")}`;
}

/**
 * Computes a user's activation verdict from their per-day cells over the
 * trailing window. A day qualifies as HVUC when the user was a DAU that day AND
 * produced at least one staked-tool, frame, orchestration, or unsupervised signal.
 * Activation requires ≥MIN_HVUC_DAYS qualifying days spanning ≥MIN_DISTINCT_WEEKS
 * distinct Monday-based UTC weeks.
 */
export function computeActivationFromCells(
  cells: UserDayCell[]
): ActivationResult {
  const qualifyingDays: string[] = [];
  const weeks = new Set<string>();
  const categories = new Set<ActivationCategory>();

  for (const cell of cells) {
    if (!cell.isDau || cell.categories.length === 0) {
      continue;
    }
    qualifyingDays.push(moment.utc(cell.dayMs).format("YYYY-MM-DD"));
    weeks.add(isoWeekKey(cell.dayMs));
    for (const category of cell.categories) {
      categories.add(category);
    }
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
      categories: [...categories].sort(),
    },
  };
}

interface FilterAggBucket {
  doc_count: number;
}

interface TermsBucket {
  key: string;
  doc_count: number;
}

interface ServerToolsBucket extends TermsBucket {
  by_tool?: { buckets: TermsBucket[] };
}

interface CompositeDayBucket {
  key: { user_id: string; day: number };
  doc_count: number;
  human_day?: FilterAggBucket;
  orchestration?: FilterAggBucket;
  unsupervised?: FilterAggBucket;
  // Distinct succeeded tools used that (user, day), for stake/frame
  // classification.
  tools?: { succeeded?: { by_server?: { buckets: ServerToolsBucket[] } } };
}

// Per-(user, day) distinct tool count is tiny (~10), so a generous terms size
// makes truncation effectively impossible. filter aggs (human/orchestration/
// unsupervised) stay exact; only these tool terms could truncate.
const TOOL_TERMS_AGG_SIZE = 100;

interface EvaluatorAggs {
  by_user_day?: {
    after_key?: { user_id: string; day: number };
    buckets: CompositeDayBucket[];
  };
}

function cellCategories(bucket: CompositeDayBucket): ActivationCategory[] {
  const categories = new Set<ActivationCategory>();

  // Staked tool / frame create: classify the day's distinct succeeded tools in
  // TS via the stake-derived policy. ES only returns the (server, tool) facts.
  for (const serverBucket of bucket.tools?.succeeded?.by_server?.buckets ??
    []) {
    for (const toolBucket of serverBucket.by_tool?.buckets ?? []) {
      const flag = classifyStakeOrFrameTool(serverBucket.key, toolBucket.key);
      if (flag) {
        categories.add(flag);
      }
    }
  }

  // Orchestration / unsupervised: static definitional filters computed in-query.
  if ((bucket.orchestration?.doc_count ?? 0) > 0) {
    categories.add("IS_ORCHESTRATION");
  }
  if ((bucket.unsupervised?.doc_count ?? 0) > 0) {
    categories.add("IS_UNSUPERVISED");
  }

  return [...categories];
}

/**
 * Batch-evaluates activation for a set of users in one workspace using a single
 * composite Elasticsearch aggregation (one query per workspace, not per user).
 *
 * Programmatic origins are excluded in-query; DAU and high-value signals
 * (staked tool, frame, orchestration, unsupervised) are computed per (user, day).
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

  const results = new Map<string, ActivationResult>();
  if (userIds.length === 0) {
    return new Ok(results);
  }

  const windowStart = moment
    .utc(asOf)
    .subtract(TRAILING_WINDOW_DAYS, "days")
    .toISOString();
  const windowEnd = moment.utc(asOf).toISOString();

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { terms: { user_id: userIds } },
        { range: { timestamp: { gte: windowStart, lt: windowEnd } } },
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
      ],
      must_not: [
        // Organic constraint: drop programmatic-origin activity entirely.
        { terms: { context_origin: PROGRAMMATIC_ORIGINS } },
      ],
    },
  };

  // Accumulate per-user cells across composite pages.
  const cellsByUser = new Map<string, UserDayCell[]>();
  for (const userId of userIds) {
    cellsByUser.set(userId, []);
  }

  let afterKey: { user_id: string; day: number } | undefined;
  for (let page = 0; page < MAX_COMPOSITE_PAGES; page++) {
    const composite: estypes.AggregationsCompositeAggregation = {
      size: COMPOSITE_PAGE_SIZE,
      sources: [
        { user_id: { terms: { field: "user_id" } } },
        {
          day: {
            date_histogram: {
              field: "timestamp",
              calendar_interval: "1d",
              time_zone: "UTC",
            },
          },
        },
      ],
      ...(afterKey ? { after: afterKey } : {}),
    };

    const result = await searchAnalytics<never, EvaluatorAggs>(query, {
      size: 0,
      aggregations: {
        by_user_day: {
          composite,
          aggregations: {
            human_day: { filter: { terms: { context_origin: HUMAN_ORIGINS } } },
            // Return the distinct succeeded tools used that (user, day);
            // stake/frame classification happens in TS (policy over facts).
            tools: {
              nested: { path: "tools_used" },
              aggs: {
                succeeded: {
                  filter: { term: { "tools_used.status": "succeeded" } },
                  aggs: {
                    by_server: {
                      terms: {
                        field: "tools_used.server_name",
                        size: TOOL_TERMS_AGG_SIZE,
                      },
                      aggs: {
                        by_tool: {
                          terms: {
                            field: "tools_used.tool_name",
                            size: TOOL_TERMS_AGG_SIZE,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            orchestration: {
              filter: {
                nested: {
                  path: "tools_used",
                  query: {
                    bool: {
                      filter: [
                        {
                          term: {
                            "tools_used.server_name": RUN_AGENT_SERVER_NAME,
                          },
                        },
                        // Only a successful run_agent call counts as orchestration.
                        { term: { "tools_used.status": "succeeded" } },
                      ],
                    },
                  },
                },
              },
            },
            unsupervised: {
              filter: { term: { context_origin: TRIGGERED_ORIGIN } },
            },
          },
        },
      },
    });

    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const agg = result.value.aggregations?.by_user_day;
    const buckets = agg?.buckets ?? [];
    for (const bucket of buckets) {
      const userCells = cellsByUser.get(bucket.key.user_id);
      if (!userCells) {
        continue;
      }
      userCells.push({
        userId: bucket.key.user_id,
        dayMs: bucket.key.day,
        isDau: (bucket.human_day?.doc_count ?? 0) > 0,
        categories: cellCategories(bucket),
      });
    }

    afterKey = agg?.after_key;
    if (!afterKey || buckets.length === 0) {
      break;
    }
  }

  for (const userId of userIds) {
    results.set(
      userId,
      computeActivationFromCells(cellsByUser.get(userId) ?? [])
    );
  }

  return new Ok(results);
}
