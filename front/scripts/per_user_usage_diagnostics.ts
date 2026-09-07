import {
  bucketsToArray,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { BillingCycle } from "@app/lib/client/subscription";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { toFreeMetronomeUserId } from "@app/lib/metronome/constants";
import type { PerUserAwuUsageRow } from "@app/lib/metronome/per_user_usage";
import { fetchPerUserAwuUsageRows } from "@app/lib/metronome/per_user_usage";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import type { Logger } from "@app/logger/logger";
import {
  AGENT_MESSAGE_STATUSES_TO_TRACK,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import chunk from "lodash/chunk";
import { Op } from "sequelize";

const PAGE_SIZE = 500;
const MESSAGE_BATCH_SIZE = 500;

type Source = "legacy" | "consumption";

// A message can have units with different attribution or timestamps. Keep those
// slices separate instead of trusting a single top_hit to represent the message.
export type MessageUsageSlice = {
  messageId: string;
  userId: string | null;
  seatType: string | null;
  timestamp: string | null;
  version: string | null;
  creditMicro: number;
  documentCount: number;
  creditsByStatus: Record<string, number>;
  creditsByUsageType: Record<string, number>;
};

type Scope = BillingCycle & { userId: string; isFreeSeat: boolean };

const SOURCE_FIELDS = {
  legacy: {
    message: "message_id",
    user: "user_id",
    seat: "is_free_seat",
    time: "timestamp",
    version: "version",
    credit: "cost.billable_awu",
  },
  consumption: {
    message: "agent_message_id",
    user: "user.id",
    seat: "user.seat_type",
    time: "completed_at",
    version: "message_version",
    credit: "credit_micro",
  },
} as const;

type SliceKey = {
  message_id: string;
  user_id: string | null;
  seat_type: string | boolean | number | null;
  timestamp: string | number | null;
  version: string | null;
};
type BreakdownBucket = {
  key: string;
  credits: estypes.AggregationsSumAggregate;
};
type SliceAggregations = {
  slices: {
    after_key?: SliceKey;
    buckets: Array<{
      key: SliceKey;
      doc_count: number;
      credits: estypes.AggregationsSumAggregate;
      by_status: { buckets: BreakdownBucket[] };
      by_usage_type?: { buckets: BreakdownBucket[] };
    }>;
  };
};

export async function fetchDiagnosticSlices({
  source,
  workspaceId,
  filters,
}: {
  source: Source;
  workspaceId: string;
  filters: estypes.QueryDslQueryContainer[];
}): Promise<MessageUsageSlice[]> {
  const fields = SOURCE_FIELDS[source];
  const search =
    source === "legacy" ? searchAnalytics : searchConsumptionAnalytics;
  const toMicro = source === "legacy" ? roundCreditsToMicroCredits : Math.round;
  const slices: MessageUsageSlice[] = [];
  let afterKey: SliceKey | undefined;
  do {
    const result = await search<never, SliceAggregations>(
      {
        bool: { filter: [{ term: { workspace_id: workspaceId } }, ...filters] },
      },
      {
        size: 0,
        aggregations: {
          slices: {
            composite: {
              size: PAGE_SIZE,
              sources: [
                { message_id: { terms: { field: fields.message } } },
                {
                  user_id: {
                    terms: { field: fields.user, missing_bucket: true },
                  },
                },
                {
                  seat_type: {
                    terms: { field: fields.seat, missing_bucket: true },
                  },
                },
                {
                  timestamp: {
                    terms: { field: fields.time, missing_bucket: true },
                  },
                },
                {
                  version: {
                    terms: { field: fields.version, missing_bucket: true },
                  },
                },
              ],
              ...(afterKey ? { after: afterKey } : {}),
            },
            aggs: {
              credits: { sum: { field: fields.credit } },
              by_status: {
                terms: { field: "status", size: 20 },
                aggs: { credits: { sum: { field: fields.credit } } },
              },
              ...(source === "consumption"
                ? {
                    by_usage_type: {
                      terms: { field: "usage_type", size: 10 },
                      aggs: { credits: { sum: { field: fields.credit } } },
                    },
                  }
                : {}),
            },
          },
        },
      }
    );
    if (result.isErr()) {
      throw result.error;
    }
    const { aggregations, timed_out, _shards } = result.value;
    if (timed_out || (_shards?.failed ?? 0) > 0 || !aggregations?.slices) {
      throw new Error(`Incomplete ${source} message diagnostic query`);
    }
    const { buckets, after_key } = aggregations.slices;
    for (const bucket of buckets) {
      const { key } = bucket;
      const seatType =
        source === "legacy"
          ? key.seat_type === true ||
            key.seat_type === "true" ||
            key.seat_type === 1
            ? "free"
            : "non_free"
          : key.seat_type === null
            ? null
            : String(key.seat_type);
      const breakdown = (values: BreakdownBucket[] | undefined) =>
        Object.fromEntries(
          bucketsToArray<BreakdownBucket>(values).map((value) => [
            String(value.key),
            toMicro(value.credits.value ?? 0),
          ])
        );
      slices.push({
        messageId: key.message_id,
        userId: key.user_id,
        seatType,
        timestamp:
          key.timestamp === null ? null : new Date(key.timestamp).toISOString(),
        version: key.version,
        creditMicro: toMicro(bucket.credits.value ?? 0),
        documentCount: bucket.doc_count,
        creditsByStatus: breakdown(bucket.by_status.buckets),
        creditsByUsageType: breakdown(bucket.by_usage_type?.buckets),
      });
    }
    afterKey = buckets.length > 0 ? after_key : undefined;
  } while (afterKey);
  return slices;
}

export function exclusionReasons(
  slice: MessageUsageSlice,
  scope: Scope
): string[] {
  const reasons: string[] = [];
  if (slice.userId !== scope.userId) {
    reasons.push("different_or_missing_user");
  }
  if ((slice.seatType === "free") !== scope.isFreeSeat) {
    reasons.push("different_seat_bucket");
  }
  if (slice.timestamp === null) {
    reasons.push("missing_timestamp");
  } else {
    const timestampMs = new Date(slice.timestamp).getTime();
    if (
      timestampMs < scope.cycleStart.getTime() ||
      timestampMs > scope.cycleEnd.getTime()
    ) {
      reasons.push("outside_cycle");
    }
  }
  return reasons;
}

function sumMicro(slices: MessageUsageSlice[]): number {
  return slices.reduce((total, slice) => total + slice.creditMicro, 0);
}

function groupByMessage(
  slices: MessageUsageSlice[]
): Map<string, MessageUsageSlice[]> {
  const groups = new Map<string, MessageUsageSlice[]>();
  for (const slice of slices) {
    const group = groups.get(slice.messageId) ?? [];
    group.push(slice);
    groups.set(slice.messageId, group);
  }
  return groups;
}

function describeSlices(slices: MessageUsageSlice[], scope: Scope) {
  const selected = slices.filter(
    (slice) => exclusionReasons(slice, scope).length === 0
  );
  const breakdown = (field: "creditsByStatus" | "creditsByUsageType") => {
    const totals: Record<string, number> = {};
    for (const slice of slices) {
      for (const [key, value] of Object.entries(slice[field])) {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
    return Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [
        key,
        microCreditsToCredits(value),
      ])
    );
  };
  return {
    documentCount: slices.reduce(
      (total, slice) => total + slice.documentCount,
      0
    ),
    allAwuCredits: microCreditsToCredits(sumMicro(slices)),
    selectedAwuCredits: microCreditsToCredits(sumMicro(selected)),
    userIds: [...new Set(slices.map((slice) => slice.userId))],
    seatTypes: [...new Set(slices.map((slice) => slice.seatType))],
    timestamps: [...new Set(slices.map((slice) => slice.timestamp))].sort(),
    versions: [...new Set(slices.map((slice) => slice.version))],
    exclusionReasons: [
      ...new Set(slices.map((slice) => exclusionReasons(slice, scope)).flat()),
    ],
    // Consumption statuses describe units, not the parent message status.
    awuCreditsByStatus: breakdown("creditsByStatus"),
    awuCreditsByUsageType: breakdown("creditsByUsageType"),
  };
}

export function compareMessageUsage({
  legacy,
  consumption,
  scope,
}: {
  legacy: MessageUsageSlice[];
  consumption: MessageUsageSlice[];
  scope: Scope;
}) {
  const legacyByMessage = groupByMessage(legacy);
  const consumptionByMessage = groupByMessage(consumption);
  const messageIds = new Set([
    ...legacyByMessage.keys(),
    ...consumptionByMessage.keys(),
  ]);
  const comparisons = [...messageIds].map((messageId) => {
    const legacySlices = legacyByMessage.get(messageId) ?? [];
    const consumptionSlices = consumptionByMessage.get(messageId) ?? [];
    const selectedLegacy = legacySlices.filter(
      (slice) => exclusionReasons(slice, scope).length === 0
    );
    const selectedConsumption = consumptionSlices.filter(
      (slice) => exclusionReasons(slice, scope).length === 0
    );
    const differenceMicro =
      sumMicro(selectedConsumption) - sumMicro(selectedLegacy);
    const hasExcludedSlices =
      selectedLegacy.length !== legacySlices.length ||
      selectedConsumption.length !== consumptionSlices.length;
    const category =
      consumptionSlices.length === 0
        ? "missing_consumption"
        : legacySlices.length === 0
          ? "missing_legacy"
          : hasExcludedSlices
            ? "scope_or_amount_difference"
            : "credit_amount_difference";
    return {
      messageId,
      category,
      differenceMicro,
      legacySlices,
      consumptionSlices,
    };
  });
  const mismatches = comparisons
    .filter(({ differenceMicro }) => differenceMicro !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.differenceMicro) - Math.abs(left.differenceMicro)
    );
  const categories: Record<
    string,
    { messageCount: number; differenceMicro: number }
  > = {};
  for (const mismatch of mismatches) {
    const category = categories[mismatch.category] ?? {
      messageCount: 0,
      differenceMicro: 0,
    };
    category.messageCount++;
    category.differenceMicro += mismatch.differenceMicro;
    categories[mismatch.category] = category;
  }
  return {
    comparedMessages: messageIds.size,
    mismatchingMessages: mismatches.length,
    consumptionLegacyExactAwuCreditsDifference: microCreditsToCredits(
      mismatches.reduce(
        (total, mismatch) => total + mismatch.differenceMicro,
        0
      )
    ),
    categories: Object.fromEntries(
      Object.entries(categories).map(([key, value]) => [
        key,
        {
          messageCount: value.messageCount,
          consumptionLegacyAwuCreditsDifference: microCreditsToCredits(
            value.differenceMicro
          ),
        },
      ])
    ),
    mismatches: mismatches.map(
      ({
        messageId,
        category,
        differenceMicro,
        legacySlices,
        consumptionSlices,
      }) => ({
        messageId,
        category,
        consumptionLegacyAwuCreditsDifference:
          microCreditsToCredits(differenceMicro),
        legacy: describeSlices(legacySlices, scope),
        consumption: describeSlices(consumptionSlices, scope),
      })
    ),
  };
}

export function dailyUsageComparison({
  legacy,
  consumption,
  metronome,
  scope,
}: {
  legacy: MessageUsageSlice[];
  consumption: MessageUsageSlice[];
  metronome: PerUserAwuUsageRow[];
  scope: Scope;
}) {
  const days = new Map<
    string,
    { legacy: number; consumption: number; metronome: number }
  >();
  const add = (
    date: string,
    source: Source | "metronome",
    creditMicro: number
  ) => {
    const day = date.slice(0, 10);
    const values = days.get(day) ?? { legacy: 0, consumption: 0, metronome: 0 };
    values[source] += creditMicro;
    days.set(day, values);
  };
  for (const slice of legacy) {
    if (
      slice.timestamp !== null &&
      exclusionReasons(slice, scope).length === 0
    ) {
      add(slice.timestamp, "legacy", slice.creditMicro);
    }
  }
  for (const slice of consumption) {
    if (
      slice.timestamp !== null &&
      exclusionReasons(slice, scope).length === 0
    ) {
      add(slice.timestamp, "consumption", slice.creditMicro);
    }
  }
  for (const row of metronome) {
    add(
      row.startingOn,
      "metronome",
      roundCreditsToMicroCredits(row.awuCredits)
    );
  }
  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      legacyAwuCredits: microCreditsToCredits(values.legacy),
      consumptionAwuCredits: microCreditsToCredits(values.consumption),
      metronomeAwuCredits: microCreditsToCredits(values.metronome),
      consumptionMetronomeAwuCreditsDifference: microCreditsToCredits(
        values.consumption - values.metronome
      ),
    }));
}

// Script-only, batched metadata reads. Never loads message text or recomputes
// attribution (the recompute helper writes to the database).
type MessageMetadata = {
  messageStatus: string;
  completedAt: Date | null;
  costCredits: number | null;
  runCount: number;
  createdAt: Date;
  version: number;
  conversationId: string | undefined;
  excludedByConsumptionStatusGate: boolean;
};

export async function fetchDiagnosticMessageMetadata(
  workspace: LightWorkspaceType,
  messageIds: string[]
): Promise<Map<string, MessageMetadata>> {
  if (messageIds.length === 0) {
    return new Map();
  }
  const rows = await MessageModel.findAll({
    attributes: ["sId", "createdAt", "version"],
    where: { workspaceId: workspace.id, sId: { [Op.in]: messageIds } },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["status", "completedAt", "costCredits", "runIds"],
        required: true,
        where: { workspaceId: workspace.id },
      },
      {
        model: ConversationModel,
        as: "conversation",
        attributes: ["sId"],
        required: true,
        where: { workspaceId: workspace.id },
      },
    ],
  });
  return new Map(
    rows.map((row) => {
      const agent = row.agentMessage!;
      return [
        row.sId,
        {
          messageStatus: agent.status,
          completedAt: agent.completedAt,
          costCredits: agent.costCredits,
          runCount: agent.runIds?.length ?? 0,
          createdAt: row.createdAt,
          version: row.version,
          conversationId: row.conversation?.sId,
          excludedByConsumptionStatusGate:
            !AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agent.status) ||
            !isTerminalAgentMessageStatus(agent.status),
        },
      ];
    })
  );
}

export async function logUserUsageDiagnostics({
  workspace,
  metronomeCustomerId,
  scope,
  sampleLimit,
  logger,
  initialTotals,
}: {
  workspace: LightWorkspaceType;
  metronomeCustomerId: string;
  scope: Scope;
  sampleLimit: number;
  logger: Logger;
  initialTotals: { legacy: number; consumption: number; metronome: number };
}) {
  const startedAt = new Date().toISOString();
  logger.info(
    { userId: scope.userId },
    "Loading per-message usage diagnostics"
  );
  const messageIds = new Set<string>();
  for (const source of ["legacy", "consumption"] as const) {
    const fields = SOURCE_FIELDS[source];
    const slices = await fetchDiagnosticSlices({
      source,
      workspaceId: workspace.sId,
      filters: [
        { term: { [fields.user]: scope.userId } },
        {
          range: {
            [fields.time]: {
              gte: scope.cycleStart.toISOString(),
              lte: scope.cycleEnd.toISOString(),
            },
          },
        },
      ],
    });
    for (const slice of slices) {
      messageIds.add(slice.messageId);
    }
    logger.info(
      { userId: scope.userId, source, candidateMessages: messageIds.size },
      "Collected usage diagnostic message candidates"
    );
  }
  // Both directions, all dates/users/seats: distinguish absent documents from
  // records excluded by the consumer query. Never relax workspace isolation.
  const slicesBySource: Record<Source, MessageUsageSlice[]> = {
    legacy: [],
    consumption: [],
  };
  for (const source of ["legacy", "consumption"] as const) {
    for (const batch of chunk([...messageIds], MESSAGE_BATCH_SIZE)) {
      const slices = await fetchDiagnosticSlices({
        source,
        workspaceId: workspace.sId,
        filters: [{ terms: { [SOURCE_FIELDS[source].message]: batch } }],
      });
      slicesBySource[source].push(...slices);
    }
    logger.info(
      { userId: scope.userId, source, slices: slicesBySource[source].length },
      "Loaded usage diagnostic counterpart records"
    );
  }
  const { legacy, consumption } = slicesBySource;
  const comparison = compareMessageUsage({ legacy, consumption, scope });
  const samples = comparison.mismatches.slice(0, sampleLimit);
  const metadata = await fetchDiagnosticMessageMetadata(
    workspace,
    samples.map(({ messageId }) => messageId)
  );
  const metronomeUserId = scope.isFreeSeat
    ? toFreeMetronomeUserId(scope.userId)
    : scope.userId;
  logger.info(
    { userId: scope.userId },
    "Reading hourly Metronome diagnostic usage"
  );
  const metronomeResult = await fetchPerUserAwuUsageRows({
    workspaceId: workspace.sId,
    metronomeCustomerId,
    userIds: [metronomeUserId],
    hourly: true,
  });
  if (metronomeResult.isErr()) {
    throw metronomeResult.error;
  }
  const metronome = metronomeResult.value.filter(
    (row) => row.userId === metronomeUserId
  );
  const daily = dailyUsageComparison({ legacy, consumption, metronome, scope });
  const totals = {
    legacy: Math.round(
      microCreditsToCredits(
        sumMicro(
          legacy.filter((slice) => exclusionReasons(slice, scope).length === 0)
        )
      )
    ),
    consumption: Math.round(
      microCreditsToCredits(
        sumMicro(
          consumption.filter(
            (slice) => exclusionReasons(slice, scope).length === 0
          )
        )
      )
    ),
    metronome: Math.round(
      metronome.reduce((sum, row) => sum + row.awuCredits, 0)
    ),
  };
  const metronomeBreakdown: Record<string, number> = {};
  for (const row of metronome) {
    const key = `${row.metric}/${row.usageType}/${row.toolCategory ?? "none"}`;
    metronomeBreakdown[key] = (metronomeBreakdown[key] ?? 0) + row.awuCredits;
  }
  logger.info(
    {
      workspaceId: workspace.sId,
      userId: scope.userId,
      isFreeSeat: scope.isFreeSeat,
      cycleStart: scope.cycleStart.toISOString(),
      cycleEnd: scope.cycleEnd.toISOString(),
      startedAt,
      finishedAt: new Date().toISOString(),
      initialTotals,
      diagnosticTotals: totals,
      consumptionMetronomeAwuCreditsDifference:
        totals.consumption - totals.metronome,
      // Reads are sequential, not a shared snapshot. Metronome also switches to
      // hourly buckets here; report any drift instead of implying exact parity.
      diagnosticMinusInitialAwuCredits: {
        legacy: totals.legacy - initialTotals.legacy,
        consumption: totals.consumption - initialTotals.consumption,
        metronome: totals.metronome - initialTotals.metronome,
      },
      comparedMessages: comparison.comparedMessages,
      mismatchingMessages: comparison.mismatchingMessages,
      consumptionLegacyExactAwuCreditsDifference:
        comparison.consumptionLegacyExactAwuCreditsDifference,
      categories: comparison.categories,
      messageSampleLimit: sampleLimit,
      messageSamples: samples.map((sample) => {
        const database = metadata.get(sample.messageId) ?? null;
        const costCredits = database?.costCredits;
        return {
          ...sample,
          database,
          consumptionDatabaseAwuCreditsDifference:
            costCredits === null || costCredits === undefined
              ? null
              : sample.consumption.allAwuCredits - costCredits,
        };
      }),
      dailyUsage: daily,
      metronomeBreakdown,
      messageComparisonScope: "legacy_vs_consumption_only",
      metronomeComparisonScope: "hourly_usage_buckets_not_message_events",
    },
    "Per-user usage diagnostic breakdown"
  );
}
