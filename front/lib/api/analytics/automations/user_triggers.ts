import type { UserAutomationTriggersFilter } from "@app/lib/api/analytics/automations/schema";
import type {
  AutomationTriggers,
  RankedTriggerWithResource,
} from "@app/lib/api/analytics/automations/triggers";
import {
  buildAutomationTriggerRows,
  median,
} from "@app/lib/api/analytics/automations/triggers";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  buildConsumptionScopeQuery,
  CONVERSATION_ID_FIELD,
  CREDIT_MICRO_FIELD,
  TRIGGER_ID_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import logger from "@app/logger/logger";
import type { estypes } from "@elastic/elasticsearch";

const CREDIT_AGG = "credit_micro";
const RUNS_AGG = "runs";

type TriggerBucket = {
  key: string;
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [RUNS_AGG]?: estypes.AggregationsCardinalityAggregate;
};

type TriggerAggs = {
  by_trigger?: estypes.AggregationsMultiBucketAggregateBase<TriggerBucket>;
};

type TriggerConsumption = { runCount: number; credits: number };

export type UserAutomationTriggers = AutomationTriggers & {
  // False when the consumption query failed: the rows are still listed, with
  // their credits and runs left at zero.
  isConsumptionAvailable: boolean;
};

/**
 * Credits and runs over the period for a known set of triggers. Unlike the
 * workspace-wide ranking, the set comes from the database, so a trigger that
 * never ran still gets a row — with zeroes.
 */
async function fetchTriggersConsumption(
  auth: Authenticator,
  { period, triggerIds }: { period: ConsumptionPeriod; triggerIds: string[] }
): Promise<Map<string, TriggerConsumption> | null> {
  if (triggerIds.length === 0) {
    return new Map();
  }

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    extraFilters: [{ terms: { [TRIGGER_ID_FIELD]: triggerIds } }],
  });

  const result = await searchConsumptionAnalytics<never, TriggerAggs>(query, {
    aggregations: {
      by_trigger: {
        terms: {
          field: TRIGGER_ID_FIELD,
          size: triggerIds.length,
          order: { [CREDIT_AGG]: "desc" },
        },
        aggs: {
          [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
          // One trigger run is one conversation.
          [RUNS_AGG]: { cardinality: { field: CONVERSATION_ID_FIELD } },
        },
      },
    },
    size: 0,
  });
  if (result.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        err: result.error,
      },
      "[AutomationsAnalytics] Failed to retrieve user trigger consumption."
    );
    return null;
  }

  const buckets = bucketsToArray<TriggerBucket>(
    result.value.aggregations?.by_trigger?.buckets
  );

  return new Map(
    buckets.map((bucket) => [
      String(bucket.key),
      {
        runCount: Math.round(bucket[RUNS_AGG]?.value ?? 0),
        credits: microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0),
      },
    ])
  );
}

function matchesFilter(
  trigger: TriggerResource,
  {
    searchTerm,
    filter,
  }: { searchTerm?: string; filter?: UserAutomationTriggersFilter }
): boolean {
  if (filter?.kinds?.length && !filter.kinds.includes(trigger.kind)) {
    return false;
  }
  if (
    filter?.agentIds?.length &&
    !filter.agentIds.includes(trigger.agentConfigurationId)
  ) {
    return false;
  }
  if (searchTerm && !trigger.name.toLowerCase().includes(searchTerm)) {
    return false;
  }
  return true;
}

/**
 * The caller's own automations, ranked by gross credits over the period like
 * the workspace-wide view, with the ones that did not consume last.
 */
export async function fetchUserAutomationTriggers(
  auth: Authenticator,
  {
    period,
    limit,
    offset,
    search,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset: number;
    search?: string;
    filter?: UserAutomationTriggersFilter;
  }
): Promise<UserAutomationTriggers> {
  const editorTriggers = await TriggerResource.listByUserEditor(
    auth,
    auth.getNonNullableUser()
  );

  const searchTerm = search?.toLowerCase();

  const consumption = await fetchTriggersConsumption(auth, {
    period,
    triggerIds: editorTriggers.map((trigger) => trigger.sId),
  });
  const consumptionByTriggerId: Map<string, TriggerConsumption> =
    consumption ?? new Map();

  const ranked: RankedTriggerWithResource[] = editorTriggers
    .filter((trigger) => matchesFilter(trigger, { searchTerm, filter }))
    .map((trigger) => ({
      trigger,
      runCount: consumptionByTriggerId.get(trigger.sId)?.runCount ?? 0,
      credits: consumptionByTriggerId.get(trigger.sId)?.credits ?? 0,
    }))
    .sort(
      (a, b) =>
        b.credits - a.credits ||
        b.runCount - a.runCount ||
        a.trigger.name.localeCompare(b.trigger.name)
    );

  // Triggers that never ran have nothing to compare a "how often" or "per run
  // cost" stat against, so the baseline only looks at the ones that did.
  const active = [...consumptionByTriggerId.values()].filter(
    (entry) => entry.runCount > 0
  );

  const rows = await buildAutomationTriggerRows(
    auth,
    ranked.slice(offset, offset + limit)
  );

  return {
    period,
    totalCount: ranked.length,
    triggers: rows,
    medianRunCount: median(active.map((c) => c.runCount)),
    medianCostPerRun: median(active.map((c) => c.credits / c.runCount)),
    isConsumptionAvailable: consumption !== null,
  };
}
