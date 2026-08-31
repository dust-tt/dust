import { INTERACTIVE_CONTENT_SERVER_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { RUN_AGENT_SERVER_NAME } from "@app/lib/api/actions/servers/run_agent/metadata";
import { computeActivationFromCells } from "@app/lib/api/activation/evaluator";
import type { UserDayCell } from "@app/lib/api/activation/evaluator";
import {
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { isFreeOrigin } from "@app/lib/credits/agent_message_billing";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { TOOL_COST_CATEGORY_AWU_WEIGHTS } from "@app/lib/metronome/events";
import { makeScript } from "@app/scripts/helpers";
import {
  AGENT_MESSAGE_STATUSES_TO_TRACK,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import type {
  AgentMessageAnalyticsData,
  AgentMessageConsumptionAnalyticsData,
} from "@app/types/assistant/analytics";
import type { estypes } from "@elastic/elasticsearch";
import { subDays } from "date-fns";

const COMPOSITE_PAGE_SIZE = 1_000;
const EVIDENCE_DOCUMENT_LIMIT = 5_000;
const UTC_DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_WINDOW_DAYS = 28;
const DEFAULT_MAX_DIFFERENCES = 50;
const DAILY_ACTIVE_USER_ORIGINS = USER_USAGE_ORIGINS.filter(
  (origin) => origin !== "triggered"
);
const ADVANCED_TOOL_CREDIT_AMOUNT_MICRO = roundCreditsToMicroCredits(
  TOOL_COST_CATEGORY_AWU_WEIGHTS.advanced
);
const USER_USAGE_ORIGIN_SET = new Set<string>(USER_USAGE_ORIGINS);
const DAILY_ACTIVE_USER_ORIGIN_SET = new Set<string>(DAILY_ACTIVE_USER_ORIGINS);
const TRACKED_AGENT_MESSAGE_STATUS_SET = new Set<string>(
  AGENT_MESSAGE_STATUSES_TO_TRACK
);

interface CompositeDayBucket {
  key: { user_id: string; day: number };
  dau?: { doc_count: number };
  hvuc_signal?: { doc_count: number };
}

interface UserDayCellsAggregations {
  by_user_day?: {
    after_key?: { user_id: string; day: number };
    buckets: CompositeDayBucket[];
  };
}

interface FetchUserDayCellsArgs {
  userIds: string[];
  windowEnd: Date;
  windowStart: Date;
  workspaceId: string;
}

interface CellDifference {
  consumption: UserDayCell | undefined;
  legacy: UserDayCell | undefined;
}

interface EvidenceHit<TDocument> {
  documentId: string | null;
  source: TDocument;
}

interface EvidenceResult<TDocument> {
  documents: EvidenceHit<TDocument>[];
  truncated: boolean;
}

function bucketsToCells(buckets: CompositeDayBucket[]): UserDayCell[] {
  return buckets.map((bucket) => ({
    userId: bucket.key.user_id,
    dayMs: bucket.key.day,
    isDau: (bucket.dau?.doc_count ?? 0) > 0,
    isHvuc: (bucket.hvuc_signal?.doc_count ?? 0) > 0,
  }));
}

async function fetchLegacyUserDayCells({
  userIds,
  windowEnd,
  windowStart,
  workspaceId,
}: FetchUserDayCellsArgs): Promise<UserDayCell[]> {
  const cells: UserDayCell[] = [];
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        ...(userIds.length > 0 ? [{ terms: { user_id: userIds } }] : []),
        { terms: { context_origin: USER_USAGE_ORIGINS } },
        {
          range: {
            timestamp: {
              gte: windowStart.toISOString(),
              lt: windowEnd.toISOString(),
            },
          },
        },
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
      ],
    },
  };

  let afterKey: { user_id: string; day: number } | undefined;
  do {
    const result = await searchAnalytics<never, UserDayCellsAggregations>(
      query,
      {
        size: 0,
        aggregations: {
          by_user_day: {
            composite: {
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
            },
            aggregations: {
              dau: {
                filter: {
                  terms: { context_origin: DAILY_ACTIVE_USER_ORIGINS },
                },
              },
              hvuc_signal: {
                filter: {
                  nested: {
                    path: "tools_used",
                    query: {
                      bool: {
                        filter: [
                          { term: { "tools_used.status": "succeeded" } },
                        ],
                        should: [
                          {
                            range: {
                              "tools_used.cost_awu": {
                                gte: TOOL_COST_CATEGORY_AWU_WEIGHTS.advanced,
                              },
                            },
                          },
                          {
                            term: {
                              "tools_used.server_name":
                                INTERACTIVE_CONTENT_SERVER_NAME,
                            },
                          },
                          {
                            term: {
                              "tools_used.server_name": RUN_AGENT_SERVER_NAME,
                            },
                          },
                        ],
                        minimum_should_match: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }
    );
    if (result.isErr()) {
      throw result.error;
    }

    const aggregation = result.value.aggregations?.by_user_day;
    const buckets = aggregation?.buckets ?? [];
    cells.push(...bucketsToCells(buckets));
    afterKey = buckets.length > 0 ? aggregation?.after_key : undefined;
  } while (afterKey);

  return cells;
}

async function fetchConsumptionUserDayCells({
  userIds,
  windowEnd,
  windowStart,
  workspaceId,
}: FetchUserDayCellsArgs): Promise<UserDayCell[]> {
  const cells: UserDayCell[] = [];
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        ...(userIds.length > 0 ? [{ terms: { "user.id": userIds } }] : []),
        { terms: { context_origin: USER_USAGE_ORIGINS } },
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

  let afterKey: { user_id: string; day: number } | undefined;
  do {
    const result = await searchConsumptionAnalytics<
      never,
      UserDayCellsAggregations
    >(query, {
      size: 0,
      aggregations: {
        by_user_day: {
          composite: {
            size: COMPOSITE_PAGE_SIZE,
            sources: [
              { user_id: { terms: { field: "user.id" } } },
              {
                day: {
                  date_histogram: {
                    field: "completed_at",
                    calendar_interval: "1d",
                    time_zone: "UTC",
                  },
                },
              },
            ],
            ...(afterKey ? { after: afterKey } : {}),
          },
          aggregations: {
            dau: {
              filter: {
                bool: {
                  filter: [
                    { term: { consumption_type: "llm" } },
                    { terms: { context_origin: DAILY_ACTIVE_USER_ORIGINS } },
                    { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
                  ],
                },
              },
            },
            hvuc_signal: {
              filter: {
                bool: {
                  filter: [
                    { term: { consumption_type: "tool" } },
                    { term: { status: "succeeded" } },
                  ],
                  should: [
                    {
                      range: {
                        "gross_credit_micro.direct": {
                          gte: ADVANCED_TOOL_CREDIT_AMOUNT_MICRO,
                        },
                      },
                    },
                    {
                      term: {
                        "tool.server_name": INTERACTIVE_CONTENT_SERVER_NAME,
                      },
                    },
                    { term: { "tool.server_name": RUN_AGENT_SERVER_NAME } },
                  ],
                  minimum_should_match: 1,
                },
              },
            },
          },
        },
      },
    });
    if (result.isErr()) {
      throw result.error;
    }

    const aggregation = result.value.aggregations?.by_user_day;
    const buckets = aggregation?.buckets ?? [];
    cells.push(...bucketsToCells(buckets));
    afterKey = buckets.length > 0 ? aggregation?.after_key : undefined;
  } while (afterKey);

  return cells;
}

function cellKey(cell: Pick<UserDayCell, "dayMs" | "userId">): string {
  return `${cell.userId}:${cell.dayMs}`;
}

function utcDayMs(timestamp: string): number {
  return Date.parse(timestamp.slice(0, 10) + "T00:00:00.000Z");
}

function utcDayRange(dayMs: number) {
  return {
    gte: new Date(dayMs).toISOString(),
    lt: new Date(dayMs + UTC_DAY_MS).toISOString(),
  };
}

function cellFromDifference(difference: CellDifference): UserDayCell {
  const cell = difference.legacy ?? difference.consumption;
  if (!cell) {
    throw new Error("Cell difference has no source cell");
  }
  return cell;
}

function evidenceHits<TDocument>(
  hits: estypes.SearchHit<TDocument>[]
): EvidenceHit<TDocument>[] {
  return hits.flatMap((hit) =>
    hit._source ? [{ documentId: hit._id ?? null, source: hit._source }] : []
  );
}

async function fetchLegacyCellEvidence({
  differences,
  workspaceId,
}: {
  differences: CellDifference[];
  workspaceId: string;
}): Promise<EvidenceResult<AgentMessageAnalyticsData>> {
  if (differences.length === 0) {
    return { documents: [], truncated: false };
  }

  const result = await searchAnalytics<AgentMessageAnalyticsData>(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspaceId } },
          { terms: { context_origin: USER_USAGE_ORIGINS } },
          { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
          {
            bool: {
              should: differences.map((difference) => {
                const cell = cellFromDifference(difference);
                return {
                  bool: {
                    filter: [
                      { term: { user_id: cell.userId } },
                      { range: { timestamp: utcDayRange(cell.dayMs) } },
                    ],
                  },
                };
              }),
              minimum_should_match: 1,
            },
          },
        ],
      },
    },
    { size: EVIDENCE_DOCUMENT_LIMIT }
  );
  if (result.isErr()) {
    throw result.error;
  }

  const hits = result.value.hits.hits;
  return {
    documents: evidenceHits(hits),
    truncated: hits.length === EVIDENCE_DOCUMENT_LIMIT,
  };
}

async function fetchConsumptionCellEvidence({
  differences,
  workspaceId,
}: {
  differences: CellDifference[];
  workspaceId: string;
}): Promise<EvidenceResult<AgentMessageConsumptionAnalyticsData>> {
  if (differences.length === 0) {
    return { documents: [], truncated: false };
  }

  const result =
    await searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspaceId } },
            { terms: { context_origin: USER_USAGE_ORIGINS } },
            {
              bool: {
                should: differences.map((difference) => {
                  const cell = cellFromDifference(difference);
                  return {
                    bool: {
                      filter: [
                        { term: { "user.id": cell.userId } },
                        {
                          range: {
                            completed_at: utcDayRange(cell.dayMs),
                          },
                        },
                      ],
                    },
                  };
                }),
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
      { size: EVIDENCE_DOCUMENT_LIMIT }
    );
  if (result.isErr()) {
    throw result.error;
  }

  const hits = result.value.hits.hits;
  return {
    documents: evidenceHits(hits),
    truncated: hits.length === EVIDENCE_DOCUMENT_LIMIT,
  };
}

async function fetchLegacyMessageEvidence({
  messageIds,
  workspaceId,
}: {
  messageIds: string[];
  workspaceId: string;
}): Promise<EvidenceResult<AgentMessageAnalyticsData>> {
  if (messageIds.length === 0) {
    return { documents: [], truncated: false };
  }

  const result = await searchAnalytics<AgentMessageAnalyticsData>(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspaceId } },
          { terms: { message_id: messageIds } },
        ],
      },
    },
    { size: EVIDENCE_DOCUMENT_LIMIT }
  );
  if (result.isErr()) {
    throw result.error;
  }

  const hits = result.value.hits.hits;
  return {
    documents: evidenceHits(hits),
    truncated: hits.length === EVIDENCE_DOCUMENT_LIMIT,
  };
}

async function fetchConsumptionMessageEvidence({
  messageIds,
  workspaceId,
}: {
  messageIds: string[];
  workspaceId: string;
}): Promise<EvidenceResult<AgentMessageConsumptionAnalyticsData>> {
  if (messageIds.length === 0) {
    return { documents: [], truncated: false };
  }

  const result =
    await searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspaceId } },
            { terms: { agent_message_id: messageIds } },
          ],
        },
      },
      { size: EVIDENCE_DOCUMENT_LIMIT }
    );
  if (result.isErr()) {
    throw result.error;
  }

  const hits = result.value.hits.hits;
  return {
    documents: evidenceHits(hits),
    truncated: hits.length === EVIDENCE_DOCUMENT_LIMIT,
  };
}

function isLegacyDau(document: AgentMessageAnalyticsData): boolean {
  return (
    DAILY_ACTIVE_USER_ORIGIN_SET.has(document.context_origin ?? "") &&
    TRACKED_AGENT_MESSAGE_STATUS_SET.has(document.status)
  );
}

function isLegacyHvucTool(
  tool: AgentMessageAnalyticsData["tools_used"][number]
): boolean {
  return (
    tool.status === "succeeded" &&
    (tool.cost_awu >= TOOL_COST_CATEGORY_AWU_WEIGHTS.advanced ||
      tool.server_name === INTERACTIVE_CONTENT_SERVER_NAME ||
      tool.server_name === RUN_AGENT_SERVER_NAME)
  );
}

function isLegacyHvuc(document: AgentMessageAnalyticsData): boolean {
  return (
    USER_USAGE_ORIGIN_SET.has(document.context_origin ?? "") &&
    TRACKED_AGENT_MESSAGE_STATUS_SET.has(document.status) &&
    document.tools_used.some(isLegacyHvucTool)
  );
}

function isConsumptionDau(
  document: AgentMessageConsumptionAnalyticsData
): boolean {
  return (
    document.user !== null &&
    document.consumption_type === "llm" &&
    DAILY_ACTIVE_USER_ORIGIN_SET.has(document.context_origin ?? "") &&
    TRACKED_AGENT_MESSAGE_STATUS_SET.has(document.status)
  );
}

function isConsumptionHvucTool(
  document: AgentMessageConsumptionAnalyticsData
): boolean {
  return (
    document.consumption_type === "tool" &&
    document.status === "succeeded" &&
    (document.gross_credit_micro.direct >= ADVANCED_TOOL_CREDIT_AMOUNT_MICRO ||
      document.tool.server_name === INTERACTIVE_CONTENT_SERVER_NAME ||
      document.tool.server_name === RUN_AGENT_SERVER_NAME)
  );
}

function isConsumptionHvuc(
  document: AgentMessageConsumptionAnalyticsData
): boolean {
  return (
    document.user !== null &&
    USER_USAGE_ORIGIN_SET.has(document.context_origin ?? "") &&
    isConsumptionHvucTool(document)
  );
}

function isLegacyEvidenceForDifference(
  document: AgentMessageAnalyticsData,
  difference: CellDifference
): boolean {
  const legacy = difference.legacy;
  const consumption = difference.consumption;
  if (!legacy) {
    return false;
  }
  if (!consumption && !legacy.isDau && !legacy.isHvuc) {
    return true;
  }
  return (
    (legacy.isDau !== Boolean(consumption?.isDau) && isLegacyDau(document)) ||
    (legacy.isHvuc !== Boolean(consumption?.isHvuc) && isLegacyHvuc(document))
  );
}

function isConsumptionEvidenceForDifference(
  document: AgentMessageConsumptionAnalyticsData,
  difference: CellDifference
): boolean {
  const legacy = difference.legacy;
  const consumption = difference.consumption;
  if (!consumption) {
    return false;
  }
  if (!legacy && !consumption.isDau && !consumption.isHvuc) {
    return true;
  }
  return (
    (consumption.isDau !== Boolean(legacy?.isDau) &&
      isConsumptionDau(document)) ||
    (consumption.isHvuc !== Boolean(legacy?.isHvuc) &&
      isConsumptionHvuc(document))
  );
}

function groupEvidence<TDocument>(
  documents: EvidenceHit<TDocument>[],
  keyForDocument: (document: TDocument) => string
): Map<string, EvidenceHit<TDocument>[]> {
  const grouped = new Map<string, EvidenceHit<TDocument>[]>();
  for (const document of documents) {
    const key = keyForDocument(document.source);
    grouped.set(key, [...(grouped.get(key) ?? []), document]);
  }
  return grouped;
}

function mergeEvidence<TDocument>(
  first: EvidenceHit<TDocument>[],
  second: EvidenceHit<TDocument>[]
): EvidenceHit<TDocument>[] {
  const seenIds = new Set<string>();
  return [...first, ...second].flatMap((document) => {
    if (document.documentId === null) {
      return [document];
    }
    if (seenIds.has(document.documentId)) {
      return [];
    }
    seenIds.add(document.documentId);
    return [document];
  });
}

function legacyEvidenceSummary({
  documentId,
  source,
}: EvidenceHit<AgentMessageAnalyticsData>) {
  return {
    documentId,
    version: source.version,
    timestamp: source.timestamp,
    date: source.timestamp.slice(0, 10),
    userId: source.user_id,
    contextOrigin: source.context_origin,
    status: source.status,
    billableAwu: source.cost.billable_awu,
    isDau: isLegacyDau(source),
    isHvuc: isLegacyHvuc(source),
    qualifyingTools: source.tools_used.filter(isLegacyHvucTool).map((tool) => ({
      stepIndex: tool.step_index,
      serverName: tool.server_name,
      toolName: tool.tool_name,
      costAwu: tool.cost_awu,
    })),
  };
}

function consumptionEvidenceSummary({
  documentId,
  source,
}: EvidenceHit<AgentMessageConsumptionAnalyticsData>) {
  const summary = {
    documentId,
    consumptionKey: source.consumption_key,
    consumptionType: source.consumption_type,
    completedAt: source.completed_at,
    date: source.completed_at.slice(0, 10),
    userId: source.user?.id ?? null,
    contextOrigin: source.context_origin,
    usageType: source.usage_type,
    status: source.status,
    isDau: isConsumptionDau(source),
    isHvuc: isConsumptionHvuc(source),
  };
  if (source.consumption_type === "llm") {
    return { ...summary, tool: null };
  }

  return {
    ...summary,
    tool: {
      actionId: source.tool.action_id,
      stepIndex: source.step_index,
      serverName: source.tool.server_name,
      toolName: source.tool.name,
      directCreditMicro: source.gross_credit_micro.direct,
      qualifiesHvuc: isConsumptionHvucTool(source),
    },
  };
}

function evidenceObservations({
  consumptionDocuments,
  legacyDocuments,
}: {
  consumptionDocuments: EvidenceHit<AgentMessageConsumptionAnalyticsData>[];
  legacyDocuments: EvidenceHit<AgentMessageAnalyticsData>[];
}): string[] {
  const observations: string[] = [];
  if (legacyDocuments.length === 0) {
    observations.push("missing_from_legacy_index");
  }
  if (consumptionDocuments.length === 0) {
    observations.push("missing_from_consumption_index");
    if (
      legacyDocuments.some(({ source }) => isFreeOrigin(source.context_origin))
    ) {
      observations.push("free_origin_excluded_from_consumption");
    }
    if (
      legacyDocuments.some(
        ({ source }) => !isTerminalAgentMessageStatus(source.status)
      )
    ) {
      observations.push("non_terminal_status_excluded_from_consumption");
    }
  }
  if (legacyDocuments.length === 0 || consumptionDocuments.length === 0) {
    return observations;
  }

  const legacyDates = new Set(
    legacyDocuments.map(({ source }) => source.timestamp.slice(0, 10))
  );
  const consumptionDates = new Set(
    consumptionDocuments.map(({ source }) => source.completed_at.slice(0, 10))
  );
  if (![...legacyDates].some((date) => consumptionDates.has(date))) {
    observations.push("created_day_differs_from_completed_day");
  }

  const legacyUserIds = new Set(
    legacyDocuments.map(({ source }) => source.user_id)
  );
  const consumptionUserIds = new Set(
    consumptionDocuments.flatMap(({ source }) =>
      source.user ? [source.user.id] : []
    )
  );
  if (consumptionDocuments.some(({ source }) => source.user === null)) {
    observations.push("consumption_user_is_null");
  }
  if (![...legacyUserIds].some((userId) => consumptionUserIds.has(userId))) {
    observations.push("user_attribution_changed");
  }
  if (
    legacyDocuments.some(({ source }) => isLegacyDau(source)) !==
    consumptionDocuments.some(({ source }) => isConsumptionDau(source))
  ) {
    observations.push("dau_signal_changed");
  }
  if (
    legacyDocuments.some(({ source }) => isLegacyHvuc(source)) !==
    consumptionDocuments.some(({ source }) => isConsumptionHvuc(source))
  ) {
    observations.push("hvuc_signal_changed");
  }

  return observations;
}

function cellSummary(cell: UserDayCell | undefined) {
  return cell
    ? {
        userId: cell.userId,
        date: new Date(cell.dayMs).toISOString().slice(0, 10),
        isDau: cell.isDau,
        isHvuc: cell.isHvuc,
      }
    : null;
}

function activationByUser(cells: UserDayCell[]) {
  const cellsByUser = new Map<string, UserDayCell[]>();
  for (const cell of cells) {
    const userCells = cellsByUser.get(cell.userId) ?? [];
    userCells.push(cell);
    cellsByUser.set(cell.userId, userCells);
  }

  return new Map(
    [...cellsByUser].map(([userId, userCells]) => {
      const result = computeActivationFromCells(userCells);
      return [
        userId,
        {
          activated: result.activated,
          hvucDays: result.hvucDays,
          hvucWeeks: result.hvucWeeks,
        },
      ];
    })
  );
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
    userIds: {
      default: [],
      description: "Optional user sIds to restrict the comparison.",
      type: "array" as const,
    },
    maxDifferences: {
      default: DEFAULT_MAX_DIFFERENCES,
      description: "Maximum differences to include in the output.",
      type: "number" as const,
    },
  },
  async ({ days, maxDifferences, userIds, workspaceId }, logger) => {
    if (!Number.isInteger(days) || days <= 0) {
      throw new Error("days must be a positive integer");
    }
    if (!Number.isInteger(maxDifferences) || maxDifferences < 0) {
      throw new Error("maxDifferences must be a non-negative integer");
    }

    const windowEnd = new Date();
    const windowStart = subDays(windowEnd, days);
    const queryArgs = { userIds, windowEnd, windowStart, workspaceId };
    const legacyCells = await fetchLegacyUserDayCells(queryArgs);
    const consumptionCells = await fetchConsumptionUserDayCells(queryArgs);

    const legacyByKey = new Map(
      legacyCells.map((cell) => [cellKey(cell), cell])
    );
    const consumptionByKey = new Map(
      consumptionCells.map((cell) => [cellKey(cell), cell])
    );
    const allCellKeys = new Set([
      ...legacyByKey.keys(),
      ...consumptionByKey.keys(),
    ]);
    const cellDifferences: CellDifference[] = [...allCellKeys].flatMap(
      (key) => {
        const legacy = legacyByKey.get(key);
        const consumption = consumptionByKey.get(key);
        return legacy &&
          consumption &&
          legacy.isDau === consumption.isDau &&
          legacy.isHvuc === consumption.isHvuc
          ? []
          : [{ legacy, consumption }];
      }
    );

    const sampledCellDifferences = cellDifferences.slice(0, maxDifferences);
    const [legacyCellEvidence, consumptionCellEvidence] = await Promise.all([
      fetchLegacyCellEvidence({
        differences: sampledCellDifferences,
        workspaceId,
      }),
      fetchConsumptionCellEvidence({
        differences: sampledCellDifferences,
        workspaceId,
      }),
    ]);
    const legacyEvidenceByCell = groupEvidence(
      legacyCellEvidence.documents,
      (document) =>
        cellKey({
          dayMs: utcDayMs(document.timestamp),
          userId: document.user_id,
        })
    );
    const consumptionEvidenceByCell = groupEvidence(
      consumptionCellEvidence.documents,
      (document) =>
        document.user
          ? cellKey({
              dayMs: utcDayMs(document.completed_at),
              userId: document.user.id,
            })
          : ""
    );
    const evidenceMessageIdsByCell = sampledCellDifferences.map(
      (difference) => {
        const key = cellKey(cellFromDifference(difference));
        return [
          ...new Set([
            ...(legacyEvidenceByCell.get(key) ?? [])
              .filter(({ source }) =>
                isLegacyEvidenceForDifference(source, difference)
              )
              .map(({ source }) => source.message_id),
            ...(consumptionEvidenceByCell.get(key) ?? [])
              .filter(({ source }) =>
                isConsumptionEvidenceForDifference(source, difference)
              )
              .map(({ source }) => source.agent_message_id),
          ]),
        ];
      }
    );
    const evidenceMessageIds = [...new Set(evidenceMessageIdsByCell.flat())];
    const [legacyMessageEvidence, consumptionMessageEvidence] =
      await Promise.all([
        fetchLegacyMessageEvidence({
          messageIds: evidenceMessageIds,
          workspaceId,
        }),
        fetchConsumptionMessageEvidence({
          messageIds: evidenceMessageIds,
          workspaceId,
        }),
      ]);
    const legacyEvidenceByMessage = groupEvidence(
      mergeEvidence(
        legacyCellEvidence.documents,
        legacyMessageEvidence.documents
      ),
      (document) => document.message_id
    );
    const consumptionEvidenceByMessage = groupEvidence(
      mergeEvidence(
        consumptionCellEvidence.documents,
        consumptionMessageEvidence.documents
      ),
      (document) => document.agent_message_id
    );
    const cellDifferenceSamples = sampledCellDifferences.map(
      (difference, index) => ({
        legacy: cellSummary(difference.legacy),
        consumption: cellSummary(difference.consumption),
        evidence: {
          messages: evidenceMessageIdsByCell[index]
            .toSorted((left, right) => left.localeCompare(right))
            .map((messageId) => {
              const legacyDocuments =
                legacyEvidenceByMessage.get(messageId) ?? [];
              const consumptionDocuments =
                consumptionEvidenceByMessage.get(messageId) ?? [];
              return {
                messageId,
                observations: evidenceObservations({
                  consumptionDocuments,
                  legacyDocuments,
                }),
                legacy: legacyDocuments.map(legacyEvidenceSummary),
                consumption: consumptionDocuments.map(
                  consumptionEvidenceSummary
                ),
              };
            }),
        },
      })
    );

    const comparedUserIds = new Set([
      ...userIds,
      ...legacyCells.map((cell) => cell.userId),
      ...consumptionCells.map((cell) => cell.userId),
    ]);
    const legacyActivation = activationByUser(legacyCells);
    const consumptionActivation = activationByUser(consumptionCells);
    const emptyActivation = { activated: false, hvucDays: 0, hvucWeeks: 0 };
    const activationDifferences = [...comparedUserIds].flatMap((userId) => {
      const legacy = legacyActivation.get(userId) ?? emptyActivation;
      const consumption = consumptionActivation.get(userId) ?? emptyActivation;
      return legacy.activated === consumption.activated &&
        legacy.hvucDays === consumption.hvucDays &&
        legacy.hvucWeeks === consumption.hvucWeeks
        ? []
        : [{ userId, legacy, consumption }];
    });

    logger.info(
      {
        workspaceId,
        comparedUserCount: comparedUserIds.size,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        legacyCellCount: legacyCells.length,
        consumptionCellCount: consumptionCells.length,
        cellDifferenceCount: cellDifferences.length,
        qualifyingDayDifferenceCount: cellDifferences.filter(
          ({ consumption, legacy }) =>
            Boolean(legacy?.isDau && legacy.isHvuc) !==
            Boolean(consumption?.isDau && consumption.isHvuc)
        ).length,
        activationMetricsDifferenceCount: activationDifferences.length,
        activationVerdictDifferenceCount: activationDifferences.filter(
          ({ consumption, legacy }) =>
            consumption.activated !== legacy.activated
        ).length,
        diagnosticEvidence: {
          evidenceMessageCount: evidenceMessageIds.length,
          documentLimitPerQuery: EVIDENCE_DOCUMENT_LIMIT,
          truncated: {
            legacyCells: legacyCellEvidence.truncated,
            consumptionCells: consumptionCellEvidence.truncated,
            legacyMessages: legacyMessageEvidence.truncated,
            consumptionMessages: consumptionMessageEvidence.truncated,
          },
        },
        samples: {
          cellDifferences: cellDifferenceSamples,
          activationDifferences: activationDifferences.slice(0, maxDifferences),
        },
      },
      "Compared activation analytics indices"
    );
  }
);
