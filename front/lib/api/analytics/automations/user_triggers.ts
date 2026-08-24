import type { UserAutomationTriggersFilter } from "@app/lib/api/analytics/automations/schema";
import type {
  AutomationTriggers,
  RankedTriggerWithResource,
} from "@app/lib/api/analytics/automations/triggers";
import {
  buildAutomationTriggerRows,
  fetchTriggersRanking,
  median,
} from "@app/lib/api/analytics/automations/triggers";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { CARDINALITY_PRECISION_THRESHOLD } from "@app/lib/api/analytics/consumption/scope";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";

type TriggerConsumption = { runCount: number; credits: number };

export type UserAutomationTriggers = AutomationTriggers & {
  isConsumptionAvailable: boolean;
};

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

  const rankingResult = await fetchTriggersRanking(auth, {
    period,
    limit: CARDINALITY_PRECISION_THRESHOLD,
    offset: 0,
    consumptionScopeFilter: {
      users: [auth.getNonNullableUser().sId],
      agents: filter?.agentIds,
    },
  });
  const consumptionByTriggerId: Map<string, TriggerConsumption> =
    rankingResult.isOk()
      ? new Map(
          rankingResult.value.ranking.map(
            ({ triggerId, runCount, credits }) => [
              triggerId,
              { runCount, credits },
            ]
          )
        )
      : new Map();

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
  const active = ranked.filter((entry) => entry.runCount > 0);

  const rows = await buildAutomationTriggerRows(
    auth,
    ranked.slice(offset, offset + limit)
  );

  return {
    period,
    totalCount: ranked.length,
    triggers: rows,
    medianRunCount: median(active.map(({ runCount }) => runCount)),
    medianCostPerRun: median(
      active.map(({ credits, runCount }) => credits / runCount)
    ),
    isConsumptionAvailable: rankingResult.isOk(),
  };
}
