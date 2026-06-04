import {
  aggregateToFourHourBuckets,
  getMetronomeWindowSize,
} from "@app/lib/api/analytics/metronome_usage";
import {
  DAY_MS,
  getTimestampsForWindow,
} from "@app/lib/api/analytics/time_utils";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeUsage,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getMetricLlmProviderCostAwuId,
  getMetricToolInvocationsId,
  USAGE_TYPE_FREE,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import {
  isToolCategory,
  TOOL_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

// All-usage AWU chart. Covers user + programmatic + free usage and is
// denominated in AWU credits (never USD). The AWU metric's cost_awu values
// already include the Dust markup (applied at event time), so no markup is
// applied here, and credit balances are returned as whole AWU credits.
const AWU_USAGE_GROUP_BY_KEYS = [
  "usage_type",
  "user",
  "agent",
  "api_key",
  "model",
  "origin",
  "tool_category",
] as const;

export type AwuUsageGroupByType = (typeof AWU_USAGE_GROUP_BY_KEYS)[number];

// Human-readable labels for the "usage_type" group key values.
const USAGE_TYPE_LABELS: Record<string, string> = {
  programmatic: "Programmatic",
  user: "User",
  free: "Free",
};

// Human-readable labels for the "tool_category" grouping. Besides the real
// tool_category values, it carries a synthetic "llm" bucket for all LLM usage,
// so the breakdown reads LLM / Basic tools / Advanced tools.
const TOOL_CATEGORY_LABELS: Record<string, string> = {
  llm: "LLM",
  basic: "Basic tools",
  advanced: "Advanced tools",
};

// Synthetic bucket key for the LLM slice of the tool_category grouping.
const LLM_BUCKET_KEY = "llm";

// Primary Metronome event property for each grouping (used for error
// reporting). The full per-grouping query config lives in getLlmQueryConfig.
const GROUP_BY_TO_EVENT_PROPERTY: Record<AwuUsageGroupByType, string> = {
  usage_type: USAGE_TYPE_GROUP_KEY,
  user: "user_id",
  agent: "agent_id",
  api_key: "api_key_name",
  model: "model_id",
  origin: "origin",
  tool_category: "tool_category",
};

// Sentinel bucket key for missing dimension values (e.g. user_id="unknown").
const UNKNOWN_KEY = "unknown";

// usage_type values to keep when grouping by user: user usage isn't
// attributable to programmatic API traffic, so programmatic is dropped.
const NON_PROGRAMMATIC_USAGE_TYPES = [USAGE_TYPE_USER, USAGE_TYPE_FREE];

export const AwuUsageQuerySchema = z.object({
  groupBy: z.enum(AWU_USAGE_GROUP_BY_KEYS).optional(),
  groupByCount: z.coerce.number().optional().default(5),
  selectedPeriod: z.string().optional(),
  billingCycleStartDay: z.coerce.number().min(1).max(31),
  windowSize: z.enum(["HOUR", "FOUR_HOURS", "DAY"]).optional().default("DAY"),
});

export type AwuUsageQuery = z.infer<typeof AwuUsageQuerySchema>;

export interface AwuUsagePointGroup {
  groupKey: string;
  valueCredits: number;
  cumulatedValueCredits?: number;
}

export interface AwuUsagePoint {
  timestamp: number;
  groups: AwuUsagePointGroup[];
}

export interface AwuUsageAvailableGroup {
  groupKey: string;
  groupLabel: string;
}

export interface GetAwuUsageResponse {
  points: AwuUsagePoint[];
  availableGroups: AwuUsageAvailableGroup[];
}

export type AwuUsageError =
  | { type: "metronome_not_configured" }
  | {
      type: "invalid_group_key";
      groupBy: AwuUsageGroupByType;
      eventProperty: string;
    }
  | { type: "internal_error"; message: string };

// LLM (cost_awu) query config per grouping. cost_awu is already AWU credits.
function getLlmQueryConfig(groupBy: AwuUsageGroupByType): {
  groupKey: string[];
  bucketProp: string;
  groupFilters?: Record<string, string[]>;
  // Bucket keys to drop after aggregation (e.g. user traffic has no api_key).
  dropKeys?: string[];
  // When set, all LLM entries collapse into this single bucket key regardless
  // of their group value. Used by tool_category to surface one "LLM" slice
  // alongside the per-category tool slices.
  bucketKeyOverride?: string;
} {
  switch (groupBy) {
    case "tool_category":
      // LLM events carry no tool_category, so the whole LLM total is shown as a
      // single "LLM" slice next to the Basic/Advanced tool slices. Query by a
      // low-cardinality registered key and collapse it into one bucket.
      return {
        groupKey: [USAGE_TYPE_GROUP_KEY],
        bucketProp: USAGE_TYPE_GROUP_KEY,
        bucketKeyOverride: LLM_BUCKET_KEY,
      };
    case "user":
      // Group by user, excluding programmatic traffic (not user-attributable).
      return {
        groupKey: ["user_id", USAGE_TYPE_GROUP_KEY],
        bucketProp: "user_id",
        groupFilters: { [USAGE_TYPE_GROUP_KEY]: NON_PROGRAMMATIC_USAGE_TYPES },
      };
    case "api_key":
      // API-key traffic is programmatic; user traffic carries no api_key (it is
      // emitted as "unknown"), so that bucket is dropped.
      return {
        groupKey: ["api_key_name"],
        bucketProp: "api_key_name",
        dropKeys: [UNKNOWN_KEY],
      };
    case "agent":
      return { groupKey: ["agent_id"], bucketProp: "agent_id" };
    case "model":
      return { groupKey: ["model_id"], bucketProp: "model_id" };
    case "origin":
      return { groupKey: ["origin"], bucketProp: "origin" };
    case "usage_type":
      return {
        groupKey: [USAGE_TYPE_GROUP_KEY],
        bucketProp: USAGE_TYPE_GROUP_KEY,
      };
    default:
      assertNever(groupBy);
  }
}

// Tool AWU is an invocation count weighted per tool_category. Each grouping
// queries the tool metric grouped by [dimension, tool_category] and sums
// count × category weight. by-model is LLM-only by nature (tools carry no
// model_id). The [dimension, tool_category] group keys must exist on the Tool
// Invocations metric (see setup_new_pricing.ts); where they don't yet (an
// environment whose metric hasn't been recreated), the tool query fails and
// the caller falls back to LLM-only.
function getToolQueryConfig(groupBy: AwuUsageGroupByType): {
  groupKey: string[];
  bucketProp: string;
  groupFilters?: Record<string, string[]>;
} | null {
  switch (groupBy) {
    case "usage_type":
      return {
        groupKey: [USAGE_TYPE_GROUP_KEY, "tool_category"],
        bucketProp: USAGE_TYPE_GROUP_KEY,
      };
    case "user":
      // Needs usage_type in the key to drop programmatic; aggregate over it.
      return {
        groupKey: ["user_id", USAGE_TYPE_GROUP_KEY, "tool_category"],
        bucketProp: "user_id",
        groupFilters: { [USAGE_TYPE_GROUP_KEY]: NON_PROGRAMMATIC_USAGE_TYPES },
      };
    case "agent":
      return {
        groupKey: ["agent_id", "tool_category"],
        bucketProp: "agent_id",
      };
    case "api_key":
      return {
        groupKey: ["api_key_name", "tool_category"],
        bucketProp: "api_key_name",
      };
    case "origin":
      return { groupKey: ["origin", "tool_category"], bucketProp: "origin" };
    case "tool_category":
      // Tools-only view, split by category (basic / advanced).
      return { groupKey: ["tool_category"], bucketProp: "tool_category" };
    case "model":
      return null;
    default:
      assertNever(groupBy);
  }
}

interface GroupedUsageEntry {
  startingOn: string;
  value: number | null;
  group: Record<string, string> | null;
}

// Accumulate grouped Metronome entries into bucketKey → (timestamp → value).
// `weight` returns the value to add, or null to skip the entry. When
// `bucketKeyOverride` is set, every entry is collapsed into that single bucket.
function bucketGroupedEntries(
  entries: GroupedUsageEntry[],
  bucketProp: string,
  weight: (entry: GroupedUsageEntry) => number | null,
  needsFourHourAggregation: boolean,
  bucketKeyOverride?: string
): Map<string, Map<number, number>> {
  const map = new Map<string, Map<number, number>>();
  for (const entry of entries) {
    const w = weight(entry);
    if (w === null) {
      continue;
    }
    const key = bucketKeyOverride ?? entry.group?.[bucketProp] ?? UNKNOWN_KEY;
    const ts = new Date(entry.startingOn).getTime();
    let tsMap = map.get(key);
    if (!tsMap) {
      tsMap = new Map();
      map.set(key, tsMap);
    }
    tsMap.set(ts, (tsMap.get(ts) ?? 0) + w);
  }
  if (needsFourHourAggregation) {
    for (const key of [...map.keys()]) {
      map.set(key, aggregateToFourHourBuckets(map.get(key)!));
    }
  }
  return map;
}

// Add `source` buckets into `target` (sum per bucketKey/timestamp), in place.
function mergeBuckets(
  target: Map<string, Map<number, number>>,
  source: Map<string, Map<number, number>>
): void {
  for (const [key, tsMap] of source) {
    let targetTsMap = target.get(key);
    if (!targetTsMap) {
      targetTsMap = new Map();
      target.set(key, targetTsMap);
    }
    for (const [ts, value] of tsMap) {
      targetTsMap.set(ts, (targetTsMap.get(ts) ?? 0) + value);
    }
  }
}

async function resolveGroupLabels(
  auth: Authenticator,
  groupBy: AwuUsageGroupByType,
  groupKeys: string[]
): Promise<Map<string, string>> {
  const labelMap = new Map<string, string>();
  switch (groupBy) {
    case "usage_type":
      for (const key of groupKeys) {
        labelMap.set(key, USAGE_TYPE_LABELS[key] ?? key);
      }
      break;
    case "tool_category":
      for (const key of groupKeys) {
        labelMap.set(key, TOOL_CATEGORY_LABELS[key] ?? key);
      }
      break;
    case "user": {
      const users = await UserResource.fetchByIds(
        groupKeys.filter((k) => k !== UNKNOWN_KEY)
      );
      const byId = new Map(users.map((u) => [u.sId, u.fullName()]));
      for (const key of groupKeys) {
        labelMap.set(
          key,
          key === UNKNOWN_KEY ? "Unknown" : (byId.get(key) ?? key)
        );
      }
      break;
    }
    case "agent": {
      const agents = await getAgentConfigurations(auth, {
        agentIds: groupKeys.filter((k) => k !== UNKNOWN_KEY),
        variant: "extra_light",
      });
      const byId = new Map(agents.map((a) => [a.sId, a.name]));
      for (const key of groupKeys) {
        labelMap.set(
          key,
          key === UNKNOWN_KEY ? "Unknown" : (byId.get(key) ?? key)
        );
      }
      break;
    }
    case "api_key":
    case "model":
    case "origin":
      for (const key of groupKeys) {
        labelMap.set(key, key);
      }
      break;
    default:
      assertNever(groupBy);
  }
  return labelMap;
}

export async function getAwuUsage(
  auth: Authenticator,
  query: AwuUsageQuery
): Promise<Result<GetAwuUsageResponse, AwuUsageError>> {
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Err({ type: "metronome_not_configured" });
  }

  const awuMetricId = getMetricLlmProviderCostAwuId();

  const {
    groupBy,
    groupByCount,
    selectedPeriod,
    billingCycleStartDay,
    windowSize,
  } = query;

  const referenceDate = selectedPeriod ? new Date(selectedPeriod) : new Date();
  if (selectedPeriod) {
    referenceDate.setUTCDate(billingCycleStartDay);
  }
  const { cycleStart: periodStart, cycleEnd: periodEnd } =
    getBillingCycleFromDay(billingCycleStartDay, referenceDate, true);

  const TEN_DAYS_MS = 10 * DAY_MS;
  const cappedEnd = new Date(
    Math.min(periodEnd.getTime(), Date.now() + TEN_DAYS_MS)
  );

  const rangeStart = floorToMidnightUTC(periodStart);
  const rangeEnd = ceilToMidnightUTC(cappedEnd);
  const startingOn = rangeStart.toISOString();
  const endingBefore = rangeEnd.toISOString();

  const timestamps = getTimestampsForWindow(rangeStart, rangeEnd, windowSize);

  const groupValues: Record<string, Map<number, number>> = {};
  const availableGroups: AwuUsageAvailableGroup[] = [];

  const metronomeApiWindowSize = getMetronomeWindowSize(windowSize);
  const needsFourHourAggregation = windowSize === "FOUR_HOURS";

  if (!groupBy) {
    const result = await listMetronomeUsage({
      customerIds: [metronomeCustomerId],
      billableMetricIds: [awuMetricId],
      startingOn,
      endingBefore,
      windowSize: metronomeApiWindowSize,
    });

    if (result.isErr()) {
      return new Err({
        type: "internal_error",
        message: `Failed to retrieve AWU usage: ${result.error.message}`,
      });
    }

    let totalMap = new Map<number, number>();
    for (const entry of result.value) {
      const ts = new Date(entry.startTimestamp).getTime();
      totalMap.set(ts, (totalMap.get(ts) ?? 0) + (entry.value ?? 0));
    }
    if (needsFourHourAggregation) {
      totalMap = aggregateToFourHourBuckets(totalMap);
    }
    groupValues["total"] = totalMap;

    availableGroups.push({ groupKey: "total", groupLabel: "Total usage" });
  } else {
    const llmCfg = getLlmQueryConfig(groupBy);
    const toolCfg = getToolQueryConfig(groupBy);

    const [llmResult, toolResult] = await Promise.all([
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId: awuMetricId,
        startingOn,
        endingBefore,
        windowSize: metronomeApiWindowSize,
        groupKey: llmCfg.groupKey,
        groupFilters: llmCfg.groupFilters,
      }),
      toolCfg
        ? listMetronomeUsageWithGroups({
            customerId: metronomeCustomerId,
            billableMetricId: getMetricToolInvocationsId(),
            startingOn,
            endingBefore,
            windowSize: metronomeApiWindowSize,
            groupKey: toolCfg.groupKey,
            groupFilters: toolCfg.groupFilters,
          })
        : null,
    ]);

    if (llmResult.isErr()) {
      const msg = llmResult.error.message;
      if (msg.includes("group") || msg.includes("not found")) {
        return new Err({
          type: "invalid_group_key",
          groupBy,
          eventProperty: GROUP_BY_TO_EVENT_PROPERTY[groupBy],
        });
      }
      return new Err({
        type: "internal_error",
        message: `Failed to retrieve AWU grouped usage: ${msg}`,
      });
    }
    // Tool usage is supplementary: if its query fails (e.g. the
    // [dimension, tool_category] group key isn't present on this environment's
    // metric yet), log and fall back to LLM-only rather than failing the chart.
    if (toolResult && toolResult.isErr()) {
      logger.warn(
        { error: toolResult.error, groupBy, workspaceId: workspace.sId },
        "[Metronome] Tool usage query failed; falling back to LLM-only."
      );
    }

    // LLM cost_awu is already AWU credits.
    const mergedGroupMap = bucketGroupedEntries(
      llmResult.value,
      llmCfg.bucketProp,
      (entry) => entry.value ?? 0,
      needsFourHourAggregation,
      llmCfg.bucketKeyOverride
    );

    // Tool invocations are a count; weight per category into AWU credits and
    // merge into the same buckets.
    if (toolCfg && toolResult && toolResult.isOk()) {
      const toolMap = bucketGroupedEntries(
        toolResult.value,
        toolCfg.bucketProp,
        (entry) => {
          const category = entry.group?.["tool_category"];
          if (entry.value === null || !category || !isToolCategory(category)) {
            return null;
          }
          return entry.value * TOOL_CATEGORY_AWU_WEIGHTS[category];
        },
        needsFourHourAggregation
      );
      mergeBuckets(mergedGroupMap, toolMap);
    }

    for (const key of llmCfg.dropKeys ?? []) {
      mergedGroupMap.delete(key);
    }

    const totalMap = new Map<number, number>();
    for (const tsMap of mergedGroupMap.values()) {
      for (const [ts, value] of tsMap) {
        totalMap.set(ts, (totalMap.get(ts) ?? 0) + value);
      }
    }
    groupValues["total"] = totalMap;

    const groupTotals = [...mergedGroupMap.entries()]
      .map(([key, tsMap]) => ({
        key,
        total: [...tsMap.values()].reduce((a, b) => a + b, 0),
        tsMap,
      }))
      .sort((a, b) => b.total - a.total);

    const topGroups = groupTotals.slice(0, groupByCount);
    for (const { key, tsMap } of topGroups) {
      groupValues[key] = tsMap;
    }

    const groupKeys = topGroups.map((g) => g.key);
    const labelMap = await resolveGroupLabels(auth, groupBy, groupKeys);
    for (const key of groupKeys) {
      availableGroups.push({
        groupKey: key,
        groupLabel: labelMap.get(key) ?? key,
      });
    }
  }

  const cumulatedValues: Record<string, number> = {};
  for (const key of Object.keys(groupValues)) {
    cumulatedValues[key] = 0;
  }

  const now = Date.now();

  const points: AwuUsagePoint[] = timestamps.map((timestamp) => {
    const groups = Object.entries(groupValues)
      .filter(([key]) => !groupBy || key !== "total")
      .map(([key, tsMap]) => {
        const valueCredits = tsMap.get(timestamp) ?? 0;
        const cumulatedCredits = (cumulatedValues[key] ?? 0) + valueCredits;
        cumulatedValues[key] = cumulatedCredits;
        return {
          groupKey: key,
          valueCredits,
          cumulatedValueCredits:
            timestamp <= now ? cumulatedCredits : undefined,
        };
      });

    if (groupBy) {
      const topSumCredits = groups.reduce((acc, g) => acc + g.valueCredits, 0);
      const totalValueCredits = groupValues["total"]?.get(timestamp) ?? 0;
      const othersValueCredits = totalValueCredits - topSumCredits;
      const cumulatedOthersCredits =
        (cumulatedValues["others"] ?? 0) + othersValueCredits;
      cumulatedValues["others"] = cumulatedOthersCredits;

      groups.push({
        groupKey: "others",
        valueCredits: othersValueCredits,
        cumulatedValueCredits:
          timestamp <= now ? cumulatedOthersCredits : undefined,
      });
    }

    return {
      timestamp,
      groups,
    };
  });

  if ((cumulatedValues["others"] ?? 0) > 0) {
    availableGroups.push({ groupKey: "others", groupLabel: "Others" });
  }

  return new Ok({ points, availableGroups });
}
