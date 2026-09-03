/**
 * Compare the programmatic AWU usage returned by the legacy and consumption
 * analytics indices for a workspace's current billing cycle.
 *
 * npx tsx migrations/20260901_compare_programmatic_usage_indices.ts \
 *   --workspaceId <wId>
 */
import {
  ANALYTICS_ALIAS_NAME,
  bucketsToArray,
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { getProgrammaticUsageFilterClause } from "@app/lib/api/programmatic_usage/common";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { USAGE_TYPE_PROGRAMMATIC } from "@app/lib/metronome/constants";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";

const STATUS_BUCKET_SIZE = 10;
const MESSAGE_COMPOSITE_PAGE_SIZE = 5_000;
const MESSAGE_COMPARISON_LIMIT = 50_000;
const MESSAGE_ID_BATCH_SIZE = 5_000;
const MESSAGE_SAMPLE_LIMIT = 20;

type StatusCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type ProgrammaticCreditsAggregations = {
  credits?: estypes.AggregationsSumAggregate;
  by_status?: estypes.AggregationsTermsAggregateBase<StatusCreditsBucket>;
};

type ComparisonWindow = {
  start: Date;
  end: Date;
};

type MessageCompositeKey = {
  message_id: string;
};

type MessageStatusBucket = {
  key: string;
};

type MessageCreditsBucket = {
  key: MessageCompositeKey;
  credits?: estypes.AggregationsSumAggregate;
  first_at?: estypes.AggregationsMinAggregate;
  last_at?: estypes.AggregationsMaxAggregate;
  by_status?: estypes.AggregationsTermsAggregateBase<MessageStatusBucket>;
};

type MessageCreditsAggregations = {
  by_message?: {
    after_key?: MessageCompositeKey;
    buckets: MessageCreditsBucket[];
  };
};

type MessageCredits = {
  messageId: string;
  creditMicro: number;
  firstAt: string | null;
  lastAt: string | null;
  statuses: string[];
};

type MessageCreditsResult = {
  messages: Map<string, MessageCredits>;
  truncated: boolean;
};

type MessageComparisonPair = {
  legacy?: MessageCredits;
  consumption?: MessageCredits;
};

function dateAggregateToIso(
  aggregate:
    | estypes.AggregationsMinAggregate
    | estypes.AggregationsMaxAggregate
    | undefined
): string | null {
  return aggregate?.value === null || aggregate?.value === undefined
    ? null
    : new Date(aggregate.value).toISOString();
}

function statusesFromBucket(bucket: MessageCreditsBucket): string[] {
  return bucketsToArray<MessageStatusBucket>(bucket.by_status?.buckets)
    .map(({ key }) => String(key))
    .sort();
}

async function fetchLegacyMessageCredits({
  limit,
  messageIds,
  window,
  workspaceId,
}: {
  limit: number;
  messageIds?: string[];
  window?: ComparisonWindow;
  workspaceId: string;
}): Promise<MessageCreditsResult> {
  const messages = new Map<string, MessageCredits>();
  let afterKey: MessageCompositeKey | undefined;
  let truncated = false;

  do {
    const remaining = limit - messages.size;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const filter: estypes.QueryDslQueryContainer[] = [
      { term: { workspace_id: workspaceId } },
      getProgrammaticUsageFilterClause(),
    ];
    if (messageIds) {
      filter.push({ terms: { message_id: messageIds } });
    }
    if (window) {
      filter.push({
        range: {
          timestamp: {
            gte: window.start.toISOString(),
            lte: window.end.toISOString(),
          },
        },
      });
    }

    const result = await searchAnalytics<never, MessageCreditsAggregations>(
      { bool: { filter } },
      {
        aggregations: {
          by_message: {
            composite: {
              size: Math.min(MESSAGE_COMPOSITE_PAGE_SIZE, remaining),
              sources: [{ message_id: { terms: { field: "message_id" } } }],
              ...(afterKey ? { after: afterKey } : {}),
            },
            aggs: {
              credits: { sum: { field: "cost.billable_awu" } },
              first_at: { min: { field: "timestamp" } },
              last_at: { max: { field: "timestamp" } },
              by_status: {
                terms: { field: "status", size: STATUS_BUCKET_SIZE },
              },
            },
          },
        },
        size: 0,
      }
    );
    if (result.isErr()) {
      throw new Error(
        `Failed to query ${ANALYTICS_ALIAS_NAME} by message: ${result.error.message}`
      );
    }

    const aggregation = result.value.aggregations?.by_message;
    const buckets = aggregation?.buckets ?? [];
    for (const bucket of buckets) {
      messages.set(bucket.key.message_id, {
        messageId: bucket.key.message_id,
        creditMicro: roundCreditsToMicroCredits(bucket.credits?.value ?? 0),
        firstAt: dateAggregateToIso(bucket.first_at),
        lastAt: dateAggregateToIso(bucket.last_at),
        statuses: statusesFromBucket(bucket),
      });
    }

    afterKey = buckets.length > 0 ? aggregation?.after_key : undefined;
    if (afterKey && messages.size >= limit) {
      truncated = true;
      break;
    }
  } while (afterKey);

  return { messages, truncated };
}

async function fetchConsumptionMessageCredits({
  limit,
  messageIds,
  window,
  workspaceId,
}: {
  limit: number;
  messageIds?: string[];
  window?: ComparisonWindow;
  workspaceId: string;
}): Promise<MessageCreditsResult> {
  const messages = new Map<string, MessageCredits>();
  let afterKey: MessageCompositeKey | undefined;
  let truncated = false;

  do {
    const remaining = limit - messages.size;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const filter: estypes.QueryDslQueryContainer[] = [
      { term: { workspace_id: workspaceId } },
      { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
    ];
    if (messageIds) {
      filter.push({ terms: { agent_message_id: messageIds } });
    }
    if (window) {
      filter.push({
        range: {
          completed_at: {
            gte: window.start.toISOString(),
            lte: window.end.toISOString(),
          },
        },
      });
    }

    const result = await searchConsumptionAnalytics<
      never,
      MessageCreditsAggregations
    >(
      { bool: { filter } },
      {
        aggregations: {
          by_message: {
            composite: {
              size: Math.min(MESSAGE_COMPOSITE_PAGE_SIZE, remaining),
              sources: [
                {
                  message_id: {
                    terms: { field: "agent_message_id" },
                  },
                },
              ],
              ...(afterKey ? { after: afterKey } : {}),
            },
            aggs: {
              credits: { sum: { field: "credit_micro" } },
              first_at: { min: { field: "completed_at" } },
              last_at: { max: { field: "completed_at" } },
              by_status: {
                terms: { field: "status", size: STATUS_BUCKET_SIZE },
              },
            },
          },
        },
        size: 0,
      }
    );
    if (result.isErr()) {
      throw new Error(
        `Failed to query ${CONSUMPTION_ANALYTICS_ALIAS_NAME} by message: ${result.error.message}`
      );
    }

    const aggregation = result.value.aggregations?.by_message;
    const buckets = aggregation?.buckets ?? [];
    for (const bucket of buckets) {
      messages.set(bucket.key.message_id, {
        messageId: bucket.key.message_id,
        creditMicro: Math.round(bucket.credits?.value ?? 0),
        firstAt: dateAggregateToIso(bucket.first_at),
        lastAt: dateAggregateToIso(bucket.last_at),
        statuses: statusesFromBucket(bucket),
      });
    }

    afterKey = buckets.length > 0 ? aggregation?.after_key : undefined;
    if (afterKey && messages.size >= limit) {
      truncated = true;
      break;
    }
  } while (afterKey);

  return { messages, truncated };
}

async function fetchLegacyMessageCreditsByIds(
  workspaceId: string,
  messageIds: string[]
): Promise<MessageCreditsResult> {
  const messages = new Map<string, MessageCredits>();
  let truncated = false;

  for (
    let startIndex = 0;
    startIndex < messageIds.length;
    startIndex += MESSAGE_ID_BATCH_SIZE
  ) {
    const batch = messageIds.slice(
      startIndex,
      startIndex + MESSAGE_ID_BATCH_SIZE
    );
    const result = await fetchLegacyMessageCredits({
      limit: batch.length + 1,
      messageIds: batch,
      workspaceId,
    });
    for (const [messageId, credits] of result.messages) {
      messages.set(messageId, credits);
    }
    truncated ||= result.truncated;
  }

  return { messages, truncated };
}

async function fetchConsumptionMessageCreditsByIds(
  workspaceId: string,
  messageIds: string[]
): Promise<MessageCreditsResult> {
  const messages = new Map<string, MessageCredits>();
  let truncated = false;

  for (
    let startIndex = 0;
    startIndex < messageIds.length;
    startIndex += MESSAGE_ID_BATCH_SIZE
  ) {
    const batch = messageIds.slice(
      startIndex,
      startIndex + MESSAGE_ID_BATCH_SIZE
    );
    const result = await fetchConsumptionMessageCredits({
      limit: batch.length + 1,
      messageIds: batch,
      workspaceId,
    });
    for (const [messageId, credits] of result.messages) {
      messages.set(messageId, credits);
    }
    truncated ||= result.truncated;
  }

  return { messages, truncated };
}

function isInWindow(
  credits: MessageCredits | undefined,
  window: ComparisonWindow
): boolean {
  if (!credits?.firstAt || !credits.lastAt) {
    return false;
  }

  return (
    Date.parse(credits.lastAt) >= window.start.getTime() &&
    Date.parse(credits.firstAt) <= window.end.getTime()
  );
}

function windowDifferenceMicroCredits(
  pair: MessageComparisonPair,
  window: ComparisonWindow
): number {
  const legacyCreditMicro = isInWindow(pair.legacy, window)
    ? (pair.legacy?.creditMicro ?? 0)
    : 0;
  const consumptionCreditMicro = isInWindow(pair.consumption, window)
    ? (pair.consumption?.creditMicro ?? 0)
    : 0;

  return consumptionCreditMicro - legacyCreditMicro;
}

function messageComparisonSample(
  pair: MessageComparisonPair,
  window: ComparisonWindow
) {
  const messageId = pair.legacy?.messageId ?? pair.consumption?.messageId;
  if (!messageId) {
    throw new Error("Message comparison pair has no message ID");
  }

  const legacyInWindow = isInWindow(pair.legacy, window);
  const consumptionInWindow = isInWindow(pair.consumption, window);

  return {
    messageId,
    legacy: pair.legacy
      ? {
          awuCredits: microCreditsToCredits(pair.legacy.creditMicro),
          firstTimestamp: pair.legacy.firstAt,
          lastTimestamp: pair.legacy.lastAt,
          messageStatuses: pair.legacy.statuses,
          inWindow: legacyInWindow,
        }
      : null,
    consumption: pair.consumption
      ? {
          awuCredits: microCreditsToCredits(pair.consumption.creditMicro),
          firstCompletedAt: pair.consumption.firstAt,
          lastCompletedAt: pair.consumption.lastAt,
          documentStatuses: pair.consumption.statuses,
          inWindow: consumptionInWindow,
        }
      : null,
    windowAwuCreditsDifference: microCreditsToCredits(
      windowDifferenceMicroCredits(pair, window)
    ),
  };
}

function summarizeMessagePairs(
  pairs: MessageComparisonPair[],
  window: ComparisonWindow
) {
  let legacyWindowCreditMicro = 0;
  let consumptionWindowCreditMicro = 0;

  for (const pair of pairs) {
    if (isInWindow(pair.legacy, window)) {
      legacyWindowCreditMicro += pair.legacy?.creditMicro ?? 0;
    }
    if (isInWindow(pair.consumption, window)) {
      consumptionWindowCreditMicro += pair.consumption?.creditMicro ?? 0;
    }
  }

  return {
    count: pairs.length,
    legacyWindowAwuCredits: microCreditsToCredits(legacyWindowCreditMicro),
    consumptionWindowAwuCredits: microCreditsToCredits(
      consumptionWindowCreditMicro
    ),
    windowAwuCreditsDifference: microCreditsToCredits(
      consumptionWindowCreditMicro - legacyWindowCreditMicro
    ),
    samples: [...pairs]
      .sort((left, right) => {
        const difference =
          Math.abs(windowDifferenceMicroCredits(right, window)) -
          Math.abs(windowDifferenceMicroCredits(left, window));
        if (difference !== 0) {
          return difference;
        }
        const leftId =
          left.legacy?.messageId ?? left.consumption?.messageId ?? "";
        const rightId =
          right.legacy?.messageId ?? right.consumption?.messageId ?? "";
        return leftId.localeCompare(rightId);
      })
      .slice(0, MESSAGE_SAMPLE_LIMIT)
      .map((pair) => messageComparisonSample(pair, window)),
  };
}

async function compareProgrammaticMessages({
  window,
  workspaceId,
}: {
  window: ComparisonWindow;
  workspaceId: string;
}) {
  const [legacyWindowResult, consumptionWindowResult] = await Promise.all([
    fetchLegacyMessageCredits({
      limit: MESSAGE_COMPARISON_LIMIT,
      window,
      workspaceId,
    }),
    fetchConsumptionMessageCredits({
      limit: MESSAGE_COMPARISON_LIMIT,
      window,
      workspaceId,
    }),
  ]);

  const sameMessageAmountDifferences: MessageComparisonPair[] = [];
  const legacyOnlyInWindow: MessageCredits[] = [];
  const consumptionOnlyInWindow: MessageCredits[] = [];
  let matchingSharedMessageCount = 0;

  for (const [messageId, legacy] of legacyWindowResult.messages) {
    const consumption = consumptionWindowResult.messages.get(messageId);
    if (!consumption) {
      legacyOnlyInWindow.push(legacy);
    } else if (legacy.creditMicro === consumption.creditMicro) {
      matchingSharedMessageCount += 1;
    } else {
      sameMessageAmountDifferences.push({ legacy, consumption });
    }
  }
  for (const [messageId, consumption] of consumptionWindowResult.messages) {
    if (!legacyWindowResult.messages.has(messageId)) {
      consumptionOnlyInWindow.push(consumption);
    }
  }

  const [consumptionForLegacyOnly, legacyForConsumptionOnly] =
    await Promise.all([
      fetchConsumptionMessageCreditsByIds(
        workspaceId,
        legacyOnlyInWindow.map(({ messageId }) => messageId)
      ),
      fetchLegacyMessageCreditsByIds(
        workspaceId,
        consumptionOnlyInWindow.map(({ messageId }) => messageId)
      ),
    ]);

  const boundaryShifted: MessageComparisonPair[] = [];
  const legacyOnly: MessageComparisonPair[] = [];
  const consumptionOnly: MessageComparisonPair[] = [];
  const counterpartInWindowButMissing: MessageComparisonPair[] = [];

  for (const legacy of legacyOnlyInWindow) {
    const consumption = consumptionForLegacyOnly.messages.get(legacy.messageId);
    const pair = { legacy, consumption };
    if (!consumption) {
      legacyOnly.push(pair);
    } else if (isInWindow(consumption, window)) {
      counterpartInWindowButMissing.push(pair);
    } else {
      boundaryShifted.push(pair);
    }
  }
  for (const consumption of consumptionOnlyInWindow) {
    const legacy = legacyForConsumptionOnly.messages.get(consumption.messageId);
    const pair = { legacy, consumption };
    if (!legacy) {
      consumptionOnly.push(pair);
    } else if (isInWindow(legacy, window)) {
      counterpartInWindowButMissing.push(pair);
    } else {
      boundaryShifted.push(pair);
    }
  }

  const legacyCreatedOnly = legacyOnly.filter(({ legacy }) =>
    legacy?.statuses.includes("created")
  );
  const mismatchPairs = [
    ...sameMessageAmountDifferences,
    ...boundaryShifted,
    ...legacyOnly,
    ...consumptionOnly,
    ...counterpartInWindowButMissing,
  ];
  const classifiedDifferenceMicroCredits = mismatchPairs.reduce(
    (total, pair) => total + windowDifferenceMicroCredits(pair, window),
    0
  );

  return {
    messageBucketLimit: MESSAGE_COMPARISON_LIMIT,
    messageSampleLimit: MESSAGE_SAMPLE_LIMIT,
    truncated: {
      legacyWindow: legacyWindowResult.truncated,
      consumptionWindow: consumptionWindowResult.truncated,
      consumptionLookupForLegacyOnly: consumptionForLegacyOnly.truncated,
      legacyLookupForConsumptionOnly: legacyForConsumptionOnly.truncated,
    },
    legacyMessageCount: legacyWindowResult.messages.size,
    consumptionMessageCount: consumptionWindowResult.messages.size,
    sharedMessageCount:
      matchingSharedMessageCount + sameMessageAmountDifferences.length,
    matchingSharedMessageCount,
    classifiedDifferenceMicroCredits,
    classifiedAwuCreditsDifference: microCreditsToCredits(
      classifiedDifferenceMicroCredits
    ),
    sameMessageAmountDifferences: summarizeMessagePairs(
      sameMessageAmountDifferences,
      window
    ),
    boundaryShifted: summarizeMessagePairs(boundaryShifted, window),
    legacyOnly: summarizeMessagePairs(legacyOnly, window),
    legacyCreatedOnly: summarizeMessagePairs(legacyCreatedOnly, window),
    consumptionOnly: summarizeMessagePairs(consumptionOnly, window),
    counterpartInWindowButMissing: summarizeMessagePairs(
      counterpartInWindowButMissing,
      window
    ),
  };
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      demandOption: true,
      description: "Workspace sId to compare.",
      type: "string" as const,
    },
  },
  async ({ workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const periodResult = await getCachedMetronomeCurrentBillingPeriod(
      workspace.sId
    );
    if (periodResult.isErr()) {
      throw periodResult.error;
    }
    if (!periodResult.value) {
      throw new Error(
        `No current billing period for workspace: ${workspaceId}`
      );
    }

    const { cycleEnd, cycleStart } = periodResult.value;
    const [legacyResult, consumptionResult] = await Promise.all([
      searchAnalytics<never, ProgrammaticCreditsAggregations>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
              getProgrammaticUsageFilterClause(),
              {
                range: {
                  timestamp: {
                    gte: cycleStart.toISOString(),
                    lte: cycleEnd.toISOString(),
                  },
                },
              },
            ],
          },
        },
        {
          aggregations: {
            credits: { sum: { field: "cost.billable_awu" } },
            by_status: {
              terms: { field: "status", size: STATUS_BUCKET_SIZE },
              aggs: {
                credits: { sum: { field: "cost.billable_awu" } },
              },
            },
          },
          size: 0,
        }
      ),
      searchConsumptionAnalytics<never, ProgrammaticCreditsAggregations>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
              { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
              {
                range: {
                  completed_at: {
                    gte: cycleStart.toISOString(),
                    lte: cycleEnd.toISOString(),
                  },
                },
              },
            ],
          },
        },
        {
          aggregations: {
            credits: { sum: { field: "credit_micro" } },
            by_status: {
              terms: { field: "status", size: STATUS_BUCKET_SIZE },
              aggs: { credits: { sum: { field: "credit_micro" } } },
            },
          },
          size: 0,
        }
      ),
    ]);

    if (legacyResult.isErr()) {
      throw new Error(
        `Failed to query ${ANALYTICS_ALIAS_NAME}: ${legacyResult.error.message}`
      );
    }
    if (consumptionResult.isErr()) {
      throw new Error(
        `Failed to query ${CONSUMPTION_ANALYTICS_ALIAS_NAME}: ${consumptionResult.error.message}`
      );
    }

    const legacyAggregations = legacyResult.value.aggregations;
    const consumptionAggregations = consumptionResult.value.aggregations;
    const legacyAwuCredits = Math.max(
      0,
      legacyAggregations?.credits?.value ?? 0
    );
    const consumptionMicroCredits = Math.max(
      0,
      Math.round(consumptionAggregations?.credits?.value ?? 0)
    );
    const consumptionAwuCredits = microCreditsToCredits(
      consumptionMicroCredits
    );
    const legacyRoundedAwuCredits = Math.round(legacyAwuCredits);
    const consumptionRoundedAwuCredits = Math.round(consumptionAwuCredits);
    const roundedAwuCreditsDifference =
      consumptionRoundedAwuCredits - legacyRoundedAwuCredits;
    const aggregateDifferenceMicroCredits =
      consumptionMicroCredits - roundCreditsToMicroCredits(legacyAwuCredits);
    const messageComparison = await compareProgrammaticMessages({
      window: { start: cycleStart, end: cycleEnd },
      workspaceId: workspace.sId,
    });

    const summary = {
      workspaceId: workspace.sId,
      cycleStart: cycleStart.toISOString(),
      cycleEnd: cycleEnd.toISOString(),
      legacy: {
        awuCredits: legacyAwuCredits,
        roundedAwuCredits: legacyRoundedAwuCredits,
        awuCreditsByStatus: Object.fromEntries(
          bucketsToArray<StatusCreditsBucket>(
            legacyAggregations?.by_status?.buckets
          ).map((bucket) => [String(bucket.key), bucket.credits?.value ?? 0])
        ),
      },
      consumption: {
        microCredits: consumptionMicroCredits,
        awuCredits: consumptionAwuCredits,
        roundedAwuCredits: consumptionRoundedAwuCredits,
        awuCreditsByStatus: Object.fromEntries(
          bucketsToArray<StatusCreditsBucket>(
            consumptionAggregations?.by_status?.buckets
          ).map((bucket) => [
            String(bucket.key),
            microCreditsToCredits(Math.round(bucket.credits?.value ?? 0)),
          ])
        ),
      },
      awuCreditsDifference: consumptionAwuCredits - legacyAwuCredits,
      roundedAwuCreditsDifference,
      matchesConsumerValue: roundedAwuCreditsDifference === 0,
      messageComparison: {
        ...messageComparison,
        aggregateDifferenceMicroCredits,
        matchesAggregateDifference:
          messageComparison.classifiedDifferenceMicroCredits ===
          aggregateDifferenceMicroCredits,
      },
    };

    if (roundedAwuCreditsDifference !== 0) {
      logger.error(
        summary,
        "Programmatic usage consumer values differ between analytics indices"
      );
      return;
    }

    logger.info(
      summary,
      "Programmatic usage consumer values match across analytics indices"
    );
  }
);
