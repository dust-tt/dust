import { fetchTriggersRanking } from "@app/lib/api/analytics/automations/triggers";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionPeriodSchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import { CARDINALITY_PRECISION_THRESHOLD } from "@app/lib/api/analytics/consumption/scope";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
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
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import { WEBHOOK_PROVIDERS } from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";
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

type PokeTriggerMetadataRow = Omit<PokeTriggerSearchRow, "consumption">;

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
  statsByTriggerId: Map<string, PokeTriggerConsumptionStats>
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
      return statsByTriggerId.get(trigger.sId)?.credits ?? 0;
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
    statsByTriggerId,
  }: {
    orderColumn: PokeTriggerOrderColumn;
    orderDirection: "asc" | "desc";
    statsByTriggerId: Map<string, PokeTriggerConsumptionStats>;
  }
) {
  const direction = orderDirection === "asc" ? 1 : -1;
  const primaryComparison = compareSortValues(
    getSortValue(left, orderColumn, statsByTriggerId),
    getSortValue(right, orderColumn, statsByTriggerId)
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
  let statsByTriggerId = new Map<string, PokeTriggerConsumptionStats>();
  let consumptionData: PokeTriggerConsumptionData = { kind: "unavailable" };

  // Reuse the analytics reader's 40k ranking boundary. A successful ranking
  // omits zero-consumption triggers; they are restored as zeroes when live
  // metadata is merged below, while an actual reader error stays unavailable.
  const rankingResult = await fetchTriggersRanking(auth, {
    period,
    limit: CARDINALITY_PRECISION_THRESHOLD,
    offset: 0,
  });
  if (rankingResult.isErr()) {
    if (orderColumn === "consumption") {
      appliedOrderColumn = "createdAt";
      appliedOrderDirection = "desc";
    }
    logger.warn(
      {
        err: rankingResult.error,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      orderColumn === "consumption"
        ? "[PokeTriggerSearch] Failed to order triggers by consumption. Falling back to creation date."
        : "[PokeTriggerSearch] Failed to retrieve trigger consumption."
    );
  } else {
    statsByTriggerId = new Map(
      rankingResult.value.ranking.map(
        ({
          triggerId,
          runCount,
          credits,
        }): [string, PokeTriggerConsumptionStats] => {
          const estimatedRunCount = Math.round(runCount);
          return [
            triggerId,
            {
              credits,
              estimatedRunCount,
              estimatedCreditsPerRun:
                estimatedRunCount > 0 ? credits / estimatedRunCount : null,
            },
          ];
        }
      )
    );
    consumptionData = { kind: "full", statsByTriggerId };
  }

  const sortedTriggers = [...matchingTriggers].sort((left, right) =>
    compareTriggerRows(left, right, {
      orderColumn: appliedOrderColumn,
      orderDirection: appliedOrderDirection,
      statsByTriggerId,
    })
  );
  const page = sortedTriggers.slice(offset, offset + limit);

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
