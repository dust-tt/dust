import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionPeriodSchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import {
  buildConsumptionScopeQuery,
  CONVERSATION_ID_FIELD,
  CREDIT_MICRO_FIELD,
  TRIGGER_ID_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import type { TriggerWithProviderAndEditor } from "@app/lib/triggers/admin/list_with_metadata";
import { listTriggersWithProviderAndEditor } from "@app/lib/triggers/admin/list_with_metadata";
import { describeScheduleConfig } from "@app/lib/utils/schedule_description";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  TriggerKind,
  TriggerOrigin,
  TriggerStatus,
  TriggerType,
} from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import { WEBHOOK_PROVIDERS } from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import { z } from "zod";

export type TriggerWithProviderType = TriggerWithProviderAndEditor;

export type PokeListTriggers = {
  triggers: TriggerWithProviderType[];
};

export type PokeTriggerConsumptionStats = {
  credits: number;
  estimatedRunCount: number | null;
  estimatedCreditsPerRun: number | null;
};

export const POKE_TRIGGER_ORDER_COLUMNS = [
  "sId",
  "name",
  "agentName",
  "kind",
  "origin",
  "provider",
  "consumption",
  "status",
  "editorEmail",
  "createdAt",
] as const;

export type PokeTriggerOrderColumn =
  (typeof POKE_TRIGGER_ORDER_COLUMNS)[number];

export const POKE_TRIGGER_PROVIDER_FILTERS = [
  ...WEBHOOK_PROVIDERS,
  "custom",
] as const;

export type PokeTriggerProviderFilter =
  (typeof POKE_TRIGGER_PROVIDER_FILTERS)[number];

export const PokeTriggerSearchBodySchema = ConsumptionPeriodSchema.extend({
  limit: z.number().int().positive().max(100).default(10),
  offset: z.number().int().nonnegative().default(0),
  search: z.string().trim().optional(),
  providers: z.array(z.enum(POKE_TRIGGER_PROVIDER_FILTERS)).optional(),
  orderColumn: z.enum(POKE_TRIGGER_ORDER_COLUMNS).default("createdAt"),
  orderDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type PokeTriggerSearchBody = z.infer<typeof PokeTriggerSearchBodySchema>;

export type PokeTriggerSearchRow = {
  sId: string;
  name: string;
  agentConfigurationId: string;
  agentName: string | null;
  kind: TriggerKind;
  configurationDescription: string;
  origin: TriggerOrigin;
  provider: WebhookProvider | null;
  status: TriggerStatus;
  editorEmail: string | null;
  createdAt: number;
  consumption: PokeTriggerConsumptionStats | null;
};

export type PokeTriggerSearchResponse = {
  period: ConsumptionPeriod;
  total: number;
  appliedOrderColumn: PokeTriggerOrderColumn;
  appliedOrderDirection: "asc" | "desc";
  triggers: PokeTriggerSearchRow[];
};

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

type PokeTriggerMetadataRow = Omit<PokeTriggerSearchRow, "consumption">;

async function fetchPokeTriggerCredits(
  auth: Authenticator,
  {
    period,
    triggerIds,
  }: {
    period: ConsumptionPeriod;
    triggerIds: string[];
  }
): Promise<Result<Map<string, number>, ElasticsearchError>> {
  if (triggerIds.length === 0) {
    return new Ok(new Map());
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
        },
        aggs: {
          [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
        },
      },
    },
    size: 0,
  });
  if (result.isErr()) {
    return result;
  }

  const creditsByTriggerId = new Map<string, number>();
  for (const bucket of bucketsToArray<TriggerBucket>(
    result.value.aggregations?.by_trigger?.buckets
  )) {
    creditsByTriggerId.set(
      String(bucket.key),
      microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0)
    );
  }

  return new Ok(creditsByTriggerId);
}

async function fetchPokeTriggerConsumptionStats(
  auth: Authenticator,
  {
    period,
    triggerIds,
  }: {
    period: ConsumptionPeriod;
    triggerIds: string[];
  }
): Promise<
  Result<Map<string, PokeTriggerConsumptionStats>, ElasticsearchError>
> {
  if (triggerIds.length === 0) {
    return new Ok(new Map());
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
        },
        aggs: {
          [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
          [RUNS_AGG]: {
            cardinality: { field: CONVERSATION_ID_FIELD },
          },
        },
      },
    },
    size: 0,
  });
  if (result.isErr()) {
    return result;
  }

  const statsByTriggerId = new Map<string, PokeTriggerConsumptionStats>();
  for (const bucket of bucketsToArray<TriggerBucket>(
    result.value.aggregations?.by_trigger?.buckets
  )) {
    const estimatedRunCount = Math.round(bucket[RUNS_AGG]?.value ?? 0);
    const credits = microCreditsToCredits(bucket[CREDIT_AGG]?.value ?? 0);

    statsByTriggerId.set(String(bucket.key), {
      credits,
      estimatedRunCount,
      estimatedCreditsPerRun:
        estimatedRunCount > 0 ? credits / estimatedRunCount : null,
    });
  }

  return new Ok(statsByTriggerId);
}

function getProviderFilterValue(
  trigger: Pick<PokeTriggerMetadataRow, "kind" | "provider">
): PokeTriggerProviderFilter | null {
  if (trigger.kind !== "webhook") {
    return null;
  }
  return trigger.provider ?? "custom";
}

function matchesSearch(trigger: PokeTriggerMetadataRow, search: string) {
  const normalizedSearch = search.toLocaleLowerCase();
  const provider = getProviderFilterValue(trigger);

  return [
    trigger.sId,
    trigger.name,
    trigger.agentConfigurationId,
    trigger.agentName,
    trigger.kind,
    trigger.origin,
    provider,
    trigger.status,
    trigger.editorEmail,
  ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
}

function getSortValue(
  trigger: PokeTriggerMetadataRow,
  orderColumn: PokeTriggerOrderColumn,
  creditsByTriggerId: Map<string, number>
): number | string {
  switch (orderColumn) {
    case "sId":
      return trigger.sId;
    case "name":
      return trigger.name;
    case "agentName":
      return trigger.agentName ?? "";
    case "kind":
      return trigger.kind;
    case "origin":
      return trigger.origin;
    case "provider":
      return getProviderFilterValue(trigger) ?? "";
    case "consumption":
      return creditsByTriggerId.get(trigger.sId) ?? 0;
    case "status":
      return trigger.status;
    case "editorEmail":
      return trigger.editorEmail ?? "";
    case "createdAt":
      return trigger.createdAt;
    default:
      return assertNever(orderColumn);
  }
}

function compareSortValues(left: number | string, right: number | string) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function compareTriggerRows(
  left: PokeTriggerMetadataRow,
  right: PokeTriggerMetadataRow,
  {
    orderColumn,
    orderDirection,
    creditsByTriggerId,
  }: {
    orderColumn: PokeTriggerOrderColumn;
    orderDirection: "asc" | "desc";
    creditsByTriggerId: Map<string, number>;
  }
) {
  const direction = orderDirection === "asc" ? 1 : -1;
  const primaryComparison = compareSortValues(
    getSortValue(left, orderColumn, creditsByTriggerId),
    getSortValue(right, orderColumn, creditsByTriggerId)
  );
  if (primaryComparison !== 0) {
    return primaryComparison * direction;
  }

  const nameComparison = left.name.localeCompare(right.name);
  if (nameComparison !== 0) {
    return nameComparison;
  }
  return left.sId.localeCompare(right.sId);
}

type PokeTriggerConsumptionData =
  | {
      kind: "full";
      statsByTriggerId: Map<string, PokeTriggerConsumptionStats>;
    }
  | {
      kind: "credits";
      creditsByTriggerId: Map<string, number>;
    }
  | { kind: "unavailable" };

function getConsumptionForRow(
  triggerId: string,
  consumptionData: PokeTriggerConsumptionData
): PokeTriggerConsumptionStats | null {
  switch (consumptionData.kind) {
    case "full":
      return (
        consumptionData.statsByTriggerId.get(triggerId) ?? {
          credits: 0,
          estimatedRunCount: 0,
          estimatedCreditsPerRun: null,
        }
      );
    case "credits":
      return {
        credits: consumptionData.creditsByTriggerId.get(triggerId) ?? 0,
        estimatedRunCount: null,
        estimatedCreditsPerRun: null,
      };
    case "unavailable":
      return null;
    default:
      return assertNever(consumptionData);
  }
}

function toSearchRow(
  trigger: PokeTriggerMetadataRow,
  consumptionData: PokeTriggerConsumptionData
): PokeTriggerSearchRow {
  return {
    sId: trigger.sId,
    name: trigger.name,
    agentConfigurationId: trigger.agentConfigurationId,
    agentName: trigger.agentName,
    kind: trigger.kind,
    configurationDescription: trigger.configurationDescription,
    origin: trigger.origin,
    provider: trigger.provider,
    status: trigger.status,
    editorEmail: trigger.editorEmail,
    createdAt: trigger.createdAt,
    consumption: getConsumptionForRow(trigger.sId, consumptionData),
  };
}

function getConfigurationDescription(trigger: TriggerWithProviderType): string {
  if (trigger.kind === "schedule") {
    return `${describeScheduleConfig(trigger.configuration)} (${trigger.configuration.timezone})`;
  }

  const parts: string[] = [];
  if (trigger.configuration.event) {
    parts.push(trigger.configuration.event);
  }
  if (trigger.configuration.filter) {
    parts.push("+ filter");
  }
  if (trigger.configuration.includePayload) {
    parts.push("w/ payload");
  }
  return parts.length > 0 ? parts.join(" ") : "All events";
}

function toMetadataRow(
  trigger: TriggerWithProviderType,
  agentNamesById: Map<string, string>
): PokeTriggerMetadataRow {
  return {
    sId: trigger.sId,
    name: trigger.name,
    agentConfigurationId: trigger.agentConfigurationId,
    agentName: agentNamesById.get(trigger.agentConfigurationId) ?? null,
    kind: trigger.kind,
    configurationDescription: getConfigurationDescription(trigger),
    origin: trigger.origin,
    provider: trigger.kind === "webhook" ? (trigger.provider ?? null) : null,
    status: trigger.status,
    editorEmail: trigger.editorUser?.email ?? null,
    createdAt: trigger.createdAt,
  };
}

export async function searchPokeTriggers(
  auth: Authenticator,
  body: PokeTriggerSearchBody
): Promise<PokeTriggerSearchResponse> {
  const { limit, offset, search, providers, orderColumn, orderDirection } =
    body;
  const period = await resolveConsumptionPeriod(
    auth,
    toConsumptionPeriodInput(body)
  );

  const triggers = await listTriggersWithProviderAndEditor(auth);
  const agentIds = [
    ...new Set(triggers.map((trigger) => trigger.agentConfigurationId)),
  ];
  const agents = await getAgentConfigurations(auth, {
    agentIds,
    variant: "extra_light",
    dangerouslySkipPermissionFiltering: true,
  });
  const agentNamesById = new Map(
    agents.map((agent: LightAgentConfigurationType) => [agent.sId, agent.name])
  );
  const providerFilter = new Set(providers);

  const matchingTriggers: PokeTriggerMetadataRow[] = triggers
    .map((trigger) => toMetadataRow(trigger, agentNamesById))
    .filter((trigger) => {
      if (providerFilter.size === 0) {
        return true;
      }
      const provider = getProviderFilterValue(trigger);
      return provider !== null && providerFilter.has(provider);
    })
    .filter((trigger) => !search || matchesSearch(trigger, search));

  let appliedOrderColumn: PokeTriggerOrderColumn = orderColumn;
  let appliedOrderDirection: "asc" | "desc" = orderDirection;
  let creditsByTriggerId = new Map<string, number>();
  let consumptionData: PokeTriggerConsumptionData = { kind: "unavailable" };
  let shouldFetchPageStats = true;

  if (orderColumn === "consumption") {
    const creditsResult = await fetchPokeTriggerCredits(auth, {
      period,
      triggerIds: matchingTriggers.map((trigger) => trigger.sId),
    });
    if (creditsResult.isErr()) {
      appliedOrderColumn = "createdAt";
      appliedOrderDirection = "desc";
      shouldFetchPageStats = false;
      logger.warn(
        {
          err: creditsResult.error,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "[PokeTriggerSearch] Failed to order triggers by consumption. Falling back to creation date."
      );
    } else {
      creditsByTriggerId = creditsResult.value;
    }
  }

  const sortedTriggers = [...matchingTriggers].sort((left, right) =>
    compareTriggerRows(left, right, {
      orderColumn: appliedOrderColumn,
      orderDirection: appliedOrderDirection,
      creditsByTriggerId,
    })
  );
  const page = sortedTriggers.slice(offset, offset + limit);

  if (shouldFetchPageStats) {
    const statsResult = await fetchPokeTriggerConsumptionStats(auth, {
      period,
      triggerIds: page.map((trigger) => trigger.sId),
    });
    if (statsResult.isErr()) {
      consumptionData =
        orderColumn === "consumption"
          ? { kind: "credits", creditsByTriggerId }
          : { kind: "unavailable" };
      logger.warn(
        {
          err: statsResult.error,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "[PokeTriggerSearch] Failed to retrieve page consumption stats."
      );
    } else {
      consumptionData = {
        kind: "full",
        statsByTriggerId: statsResult.value,
      };
    }
  }

  return {
    period,
    total: matchingTriggers.length,
    appliedOrderColumn,
    appliedOrderDirection,
    triggers: page.map((trigger) => toSearchRow(trigger, consumptionData)),
  };
}

export type PokeGetTriggerExecutionStats = {
  statusBreakdown: Record<string, number>;
  dailyVolume: Array<{
    date: string;
    succeeded: number;
    failed: number;
    notMatched: number;
    rateLimited: number;
    creditsExhausted: number;
  }>;
};

export type PokeGetTriggerDetails = {
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  editorUser: UserType | null;
};
