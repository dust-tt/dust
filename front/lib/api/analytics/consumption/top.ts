import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
  CONSUMPTION_DIMENSION_FIELDS,
  CONSUMPTION_TYPE_FIELD,
  CREDIT_MICRO_FIELD,
  creditsFromMicroCredits,
} from "@app/lib/api/analytics/consumption/scope";
import { sourceLabelForOrigin } from "@app/lib/api/analytics/source_labels";
import {
  resolveAnalyticsAgentLabels,
  UNKNOWN_AGENT_LABEL,
} from "@app/lib/api/assistant/observability/agent_labels";
import { getUserDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import { resolveServerDisplayNames } from "@app/lib/api/assistant/observability/tool_usage";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { UserResource } from "@app/lib/resources/user_resource";
import type { AgentMessageConsumptionAnalyticsType } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Top consumers of credits along one dimension over the period — the data
 * behind the dashboard's Attribution tabs and the summary's top-agent card.
 *
 * The denominator of the average differs by dimension: agent / user / model /
 * source spread their credits across whole messages, so the average is per
 * message; a tool document is itself one tool call, so tools average per call.
 *
 * Tools rank on gross credits rather than billed: a tool call's footprint is
 * billed by reconciling it into the model-input rows, so a tool document's own
 * `credit_micro` is usually just its `direct` charge (0 for tools that make no
 * direct charge). The gross total captures both the direct charge and the token
 * contribution, which is the tool's true cost (see GROSS_CREDIT_FIELD).
 */

export const CONSUMPTION_TOP_DIMENSIONS = [
  "agent",
  "user",
  "model",
  "source",
  "tool",
] as const;

export type ConsumptionTopDimension =
  (typeof CONSUMPTION_TOP_DIMENSIONS)[number];

// What one row's `count` (and therefore the average) is denominated in.
export type ConsumptionTopUnit = "message" | "tool_call";

export const DEFAULT_CONSUMPTION_TOP_LIMIT = 10;

const TOOL_CONSUMPTION_TYPE: AgentMessageConsumptionAnalyticsType = "tool";

// The billed amount. Message-scoped dimensions rank on this — it is what the
// workspace was actually charged.
const CREDIT_FIELD = CREDIT_MICRO_FIELD;
// The pre-reconciliation resource cost of a consumption unit: both the direct
// charge and the token contribution (footprint + output). A tool call's
// footprint is billed by reconciling it into the model-input rows, so a tool
// document's `credit_micro` reflects only its direct charge (0 when it makes
// none). Tool-scoped dimensions rank on this so a tool's cost is not understated.
const GROSS_CREDIT_FIELD = "gross_credit_micro.total";

type DimensionConfig = {
  field: string;
  unit: ConsumptionTopUnit;
  // Field summed for a row's credits: the billed amount for message-scoped
  // dimensions, the gross total for tool-scoped ones (see GROSS_CREDIT_FIELD).
  creditField: string;
  // Tools live on tool documents only; the other dimensions span every
  // document. Restricting keeps a tool's credits and its call count aligned.
  toolDocumentsOnly: boolean;
};

const DIMENSION_CONFIG: Record<ConsumptionTopDimension, DimensionConfig> = {
  agent: {
    field: CONSUMPTION_DIMENSION_FIELDS.agent,
    unit: "message",
    creditField: CREDIT_FIELD,
    toolDocumentsOnly: false,
  },
  user: {
    field: CONSUMPTION_DIMENSION_FIELDS.member,
    unit: "message",
    creditField: CREDIT_FIELD,
    toolDocumentsOnly: false,
  },
  model: {
    field: CONSUMPTION_DIMENSION_FIELDS.model,
    unit: "message",
    creditField: CREDIT_FIELD,
    toolDocumentsOnly: false,
  },
  source: {
    field: CONSUMPTION_DIMENSION_FIELDS.source,
    unit: "message",
    creditField: CREDIT_FIELD,
    toolDocumentsOnly: false,
  },
  tool: {
    field: CONSUMPTION_DIMENSION_FIELDS.tool,
    unit: "tool_call",
    // Gross, not billed: a tool's footprint is reconciled out of its own
    // document, so billed credit understates its cost.
    creditField: GROSS_CREDIT_FIELD,
    toolDocumentsOnly: true,
  },
};

export type ConsumptionTopRow = {
  id: string;
  name: string;
  // Only agents and users carry a picture; null for the rest.
  pictureUrl: string | null;
  credits: number;
  // Messages or tool calls, per `unit`.
  count: number;
  avgCreditPerUnit: number;
};

export type ConsumptionTop = {
  dimension: ConsumptionTopDimension;
  unit: ConsumptionTopUnit;
  // Sum over the whole scoped query (tool-only for the tool dimension), so a
  // row's share of the ranking's universe is `credits / totalCredits`.
  totalCredits: number;
  // Highest credits first.
  rows: ConsumptionTopRow[];
};

export type GetConsumptionTopResponse = ConsumptionTop;

type GroupBucket = {
  key: string;
  doc_count: number;
  credit_micro?: estypes.AggregationsSumAggregate;
  messages?: estypes.AggregationsCardinalityAggregate;
  provider?: estypes.AggregationsMultiBucketAggregateBase<{ key: string }>;
};

type TopAggs = {
  by_group?: estypes.AggregationsMultiBucketAggregateBase<GroupBucket>;
  total_credit_micro?: estypes.AggregationsSumAggregate;
};

type RowLabel = { name: string; pictureUrl: string | null };

// The bucket key is a raw model id and the sub-agg gives a raw provider id;
// match them against the supported set for a display name, falling back to the
// id when the model is no longer supported. Matches on both ids, as ids are not
// unique across providers.
function modelDisplayName(
  modelId: string,
  providerId: string | undefined
): string {
  const config = getSupportedModelConfigs().find(
    (m) => m.modelId === modelId && m.providerId === providerId
  );
  return config?.displayName ?? modelId;
}

async function resolveRowLabels(
  auth: Authenticator,
  dimension: ConsumptionTopDimension,
  buckets: GroupBucket[]
): Promise<Map<string, RowLabel>> {
  const keys = buckets.map((bucket) => String(bucket.key));

  switch (dimension) {
    case "agent": {
      const labels = await resolveAnalyticsAgentLabels(auth, keys);
      return new Map(
        keys.map((key) => {
          const label = labels.get(key) ?? UNKNOWN_AGENT_LABEL;
          return [key, { name: label.name, pictureUrl: label.pictureUrl }];
        })
      );
    }
    case "user": {
      const users = await UserResource.fetchByIds(keys);
      const usersById = new Map(users.map((user) => [user.sId, user]));
      return new Map(
        keys.map((key) => {
          const user = usersById.get(key);
          return [
            key,
            {
              name: getUserDisplayName(user),
              pictureUrl: user?.imageUrl ?? null,
            },
          ];
        })
      );
    }
    case "model": {
      return new Map(
        buckets.map((bucket) => {
          const modelId = String(bucket.key);
          const providerId = bucketsToArray<{ key: string }>(
            bucket.provider?.buckets
          )[0]?.key;
          return [
            modelId,
            { name: modelDisplayName(modelId, providerId), pictureUrl: null },
          ];
        })
      );
    }
    case "source": {
      return new Map(
        keys.map((key) => [
          key,
          { name: sourceLabelForOrigin(key) ?? key, pictureUrl: null },
        ])
      );
    }
    case "tool": {
      const displayNames = await resolveServerDisplayNames(auth, keys);
      return new Map(
        keys.map((key) => [
          key,
          { name: displayNames.get(key) ?? key, pictureUrl: null },
        ])
      );
    }
    default: {
      return new Map();
    }
  }
}

export async function fetchConsumptionTop(
  auth: Authenticator,
  {
    dimension,
    period,
    limit,
    filter,
  }: {
    dimension: ConsumptionTopDimension;
    period: ConsumptionPeriod;
    limit: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTop, ElasticsearchError>> {
  const config = DIMENSION_CONFIG[dimension];

  const query = buildConsumptionScopeQuery({
    workspaceId: auth.getNonNullableWorkspace().sId,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
    extraFilters: config.toolDocumentsOnly
      ? [{ term: { [CONSUMPTION_TYPE_FIELD]: TOOL_CONSUMPTION_TYPE } }]
      : [],
  });

  // The sub-agg keeps the name `credit_micro` regardless of which field it sums,
  // so the ranking order and the bucket reads below stay dimension-agnostic.
  const perGroupAggs: Record<string, estypes.AggregationsAggregationContainer> =
    {
      credit_micro: { sum: { field: config.creditField } },
    };
  // Message count is a distinct-message cardinality; a tool call is one
  // document, so its count is the bucket's own doc_count.
  if (config.unit === "message") {
    perGroupAggs.messages = {
      cardinality: { field: AGENT_MESSAGE_ID_FIELD },
    };
  }
  // The display name needs the provider too, which the group key does not carry.
  if (dimension === "model") {
    perGroupAggs.provider = {
      terms: { field: "model.provider_id", size: 1 },
    };
  }

  const result = await searchConsumptionAnalytics<never, TopAggs>(query, {
    aggregations: {
      by_group: {
        terms: {
          field: config.field,
          size: limit,
          order: { credit_micro: "desc" },
        },
        aggs: perGroupAggs,
      },
      total_credit_micro: { sum: { field: config.creditField } },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<GroupBucket>(
    result.value.aggregations?.by_group?.buckets
  );
  const labels = await resolveRowLabels(auth, dimension, buckets);

  const rows: ConsumptionTopRow[] = buckets.map((bucket) => {
    const id = String(bucket.key);
    const credits = creditsFromMicroCredits(bucket.credit_micro?.value ?? 0);
    const count =
      config.unit === "tool_call"
        ? bucket.doc_count
        : Math.round(bucket.messages?.value ?? 0);
    const label = labels.get(id);
    return {
      id,
      name: label?.name ?? id,
      pictureUrl: label?.pictureUrl ?? null,
      credits,
      count,
      avgCreditPerUnit: count > 0 ? credits / count : 0,
    };
  });

  return new Ok({
    dimension,
    unit: config.unit,
    totalCredits: creditsFromMicroCredits(
      result.value.aggregations?.total_credit_micro?.value ?? 0
    ),
    rows,
  });
}
