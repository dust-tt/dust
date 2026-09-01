import { uniqueMessagesCardinalityAgg } from "@app/lib/api/analytics/consumption/scope";
import { toLabeledSources } from "@app/lib/api/assistant/observability/context_origin";
import {
  bucketsToArray,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";
import { subDays } from "date-fns";

const DEFAULT_WINDOW_DAYS = 28;
const ORIGIN_BUCKET_SIZE = 20;
const UNKNOWN_CONTEXT_ORIGIN = "unknown";

type ComparisonFilters = {
  agentIds: string[];
  agentTagIds: string[];
  modelIds: string[];
  userIds: string[];
};

type FetchBreakdownArgs = ComparisonFilters & {
  windowEnd: Date;
  windowStart: Date;
  workspaceId: string;
};

type OriginBucket = {
  key: string;
  doc_count: number;
  unique_messages?: estypes.AggregationsCardinalityAggregate;
};

type ContextOriginAggs = {
  by_origin?: estypes.AggregationsMultiBucketAggregateBase<OriginBucket>;
};

type ContextOriginCount = {
  origin: string;
  count: number;
};

function legacyQuery({
  agentIds,
  agentTagIds,
  modelIds,
  userIds,
  windowEnd,
  windowStart,
  workspaceId,
}: FetchBreakdownArgs): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        ...(agentIds.length > 0 ? [{ terms: { agent_id: agentIds } }] : []),
        ...(userIds.length > 0 ? [{ terms: { user_id: userIds } }] : []),
        ...(agentTagIds.length > 0
          ? [{ terms: { agent_tag_ids: agentTagIds } }]
          : []),
        ...(modelIds.length > 0
          ? [{ terms: { "model.model_id": modelIds } }]
          : []),
        {
          range: {
            timestamp: {
              gte: windowStart.toISOString(),
              lt: windowEnd.toISOString(),
            },
          },
        },
      ],
    },
  };
}

function consumptionQuery({
  agentIds,
  agentTagIds,
  modelIds,
  userIds,
  windowEnd,
  windowStart,
  workspaceId,
}: FetchBreakdownArgs): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        ...(agentIds.length > 0 ? [{ terms: { "agent.id": agentIds } }] : []),
        ...(userIds.length > 0 ? [{ terms: { "user.id": userIds } }] : []),
        ...(agentTagIds.length > 0
          ? [{ terms: { "agent.tag_ids": agentTagIds } }]
          : []),
        ...(modelIds.length > 0
          ? [{ terms: { "model.model_id": modelIds } }]
          : []),
        {
          range: {
            completed_at: {
              gte: windowStart.toISOString(),
              lt: windowEnd.toISOString(),
            },
          },
        },
      ],
    },
  };
}

async function fetchLegacyBreakdown(
  args: FetchBreakdownArgs
): Promise<ContextOriginCount[]> {
  const result = await searchAnalytics<never, ContextOriginAggs>(
    legacyQuery(args),
    {
      size: 0,
      aggregations: {
        by_origin: {
          terms: {
            field: "context_origin",
            size: ORIGIN_BUCKET_SIZE,
            missing: UNKNOWN_CONTEXT_ORIGIN,
          },
        },
      },
    }
  );
  if (result.isErr()) {
    throw result.error;
  }

  return bucketsToArray<OriginBucket>(
    result.value.aggregations?.by_origin?.buckets
  ).map((bucket) => ({
    origin: String(bucket.key),
    count: bucket.doc_count,
  }));
}

async function fetchConsumptionBreakdown(
  args: FetchBreakdownArgs
): Promise<ContextOriginCount[]> {
  const result = await searchConsumptionAnalytics<never, ContextOriginAggs>(
    consumptionQuery(args),
    {
      size: 0,
      aggregations: {
        by_origin: {
          terms: {
            field: "normalized_origin",
            size: ORIGIN_BUCKET_SIZE,
            missing: UNKNOWN_CONTEXT_ORIGIN,
          },
          aggs: {
            unique_messages: uniqueMessagesCardinalityAgg(),
          },
        },
      },
    }
  );
  if (result.isErr()) {
    throw result.error;
  }

  return bucketsToArray<OriginBucket>(
    result.value.aggregations?.by_origin?.buckets
  ).map((bucket) => ({
    origin: String(bucket.key),
    count: Math.round(bucket.unique_messages?.value ?? 0),
  }));
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      demandOption: true,
      description: "Workspace sId to compare.",
      type: "string" as const,
    },
    days: {
      default: DEFAULT_WINDOW_DAYS,
      description: "Trailing window size in days.",
      type: "number" as const,
    },
    agentIds: {
      default: [],
      description: "Optional agent sIds to restrict the comparison.",
      type: "array" as const,
    },
    userIds: {
      default: [],
      description: "Optional user sIds to restrict the comparison.",
      type: "array" as const,
    },
    agentTagIds: {
      default: [],
      description: "Optional agent tag sIds to restrict the comparison.",
      type: "array" as const,
    },
    modelIds: {
      default: [],
      description: "Optional model ids to restrict the comparison.",
      type: "array" as const,
    },
  },
  async (
    { agentIds, agentTagIds, days, modelIds, userIds, workspaceId },
    logger
  ) => {
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error("days must be a positive integer");
    }

    const windowEnd = new Date();
    const windowStart = subDays(windowEnd, days);
    const filters = { agentIds, agentTagIds, modelIds, userIds };
    const args = {
      ...filters,
      windowEnd,
      windowStart,
      workspaceId,
    };
    const [legacyRaw, consumptionRaw] = await Promise.all([
      fetchLegacyBreakdown(args),
      fetchConsumptionBreakdown(args),
    ]);
    const legacy = toLabeledSources(legacyRaw);
    const consumption = toLabeledSources(consumptionRaw);
    const legacyByLabel = new Map(
      legacy.map(({ count, label }) => [label, count])
    );
    const consumptionByLabel = new Map(
      consumption.map(({ count, label }) => [label, count])
    );
    const labels = new Set([
      ...legacyByLabel.keys(),
      ...consumptionByLabel.keys(),
    ]);
    const sourceDifferences = [...labels]
      .map((label) => {
        const legacyCount = legacyByLabel.get(label) ?? 0;
        const consumptionCount = consumptionByLabel.get(label) ?? 0;
        return {
          label,
          legacyCount,
          consumptionCount,
          difference: consumptionCount - legacyCount,
        };
      })
      .filter(({ difference }) => difference !== 0)
      .sort(
        (left, right) => Math.abs(right.difference) - Math.abs(left.difference)
      );
    const legacyMessageCount = legacy.reduce(
      (total, source) => total + source.count,
      0
    );
    const consumptionMessageCount = consumption.reduce(
      (total, source) => total + source.count,
      0
    );

    logger.info(
      {
        workspaceId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        filters,
        legacy: {
          messageCount: legacyMessageCount,
          sources: legacy,
          rawOrigins: legacyRaw,
        },
        consumption: {
          messageCount: consumptionMessageCount,
          sources: consumption,
          rawOrigins: consumptionRaw,
        },
        messageCountDifference: consumptionMessageCount - legacyMessageCount,
        sourceDifferenceCount: sourceDifferences.length,
        sourceDifferences,
      },
      "Compared source breakdown analytics indices"
    );
  }
);
