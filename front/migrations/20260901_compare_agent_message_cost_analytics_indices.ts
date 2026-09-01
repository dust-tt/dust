import {
  ANALYTICS_ALIAS_NAME,
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type {
  AgentMessageAnalyticsData,
  AgentMessageConsumptionAnalyticsData,
} from "@app/types/assistant/analytics";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";

const DEFAULT_DAYS = 90;
const DAY_DURATION_MS = 24 * 60 * 60 * 1000;
const ES_PAGE_SIZE = 1_000;
const MAX_MISMATCH_SAMPLES = 50;

type LegacyCostDocument = Pick<
  AgentMessageAnalyticsData,
  "message_id" | "status" | "timestamp" | "version" | "workspace_id"
> &
  Partial<Pick<AgentMessageAnalyticsData, "cost" | "tools_used">>;

type ToolCharge = {
  creditsMicro: number;
  stepIndex: number;
  toolName: string;
};

type LegacyCostBreakdown = {
  llmCreditsMicro: number | null;
  status: string;
  timestamp: string;
  toolCharges: Array<ToolCharge & { status: string }>;
  toolCreditsMicro: number | null;
  totalCreditsMicro: number | null;
  version: string;
};

type ConsumptionCostBreakdown = {
  attributionVersions: number[];
  completedAt: string;
  llmCreditsMicro: number;
  messageVersions: string[];
  statuses: string[];
  toolCharges: Array<ToolCharge & { actionId: string }>;
  toolCreditsMicro: number;
  totalCreditsMicro: number;
};

type CostDifference =
  | "llm_credits"
  | "missing_consumption"
  | "missing_legacy"
  | "missing_legacy_cost"
  | "tool_charges"
  | "tool_credits"
  | "total_credits";

function parseDays(days: number): number {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error("days must be a positive integer");
  }

  return days;
}

async function fetchLegacyDocuments({
  windowEnd,
  windowStart,
  workspaceId,
}: {
  windowEnd: Date;
  windowStart: Date;
  workspaceId: string;
}): Promise<LegacyCostDocument[]> {
  const documents: LegacyCostDocument[] = [];
  let searchAfter: estypes.SortResults | undefined;

  while (true) {
    const result = await searchAnalytics<LegacyCostDocument>(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspaceId } },
            {
              range: {
                timestamp: {
                  gte: windowStart.toISOString(),
                  lte: windowEnd.toISOString(),
                },
              },
            },
          ],
        },
      },
      {
        size: ES_PAGE_SIZE,
        sort: [{ timestamp: "asc" }, { message_id: "asc" }],
        search_after: searchAfter,
      }
    );
    if (result.isErr()) {
      throw new Error(
        `Failed to query ${ANALYTICS_ALIAS_NAME}: ${result.error.message}`
      );
    }

    const { hits } = result.value.hits;
    for (const hit of hits) {
      if (hit._source) {
        documents.push(hit._source);
      }
    }

    if (hits.length < ES_PAGE_SIZE) {
      return documents;
    }
    searchAfter = hits[hits.length - 1]?.sort;
  }
}

async function fetchConsumptionDocuments({
  windowEnd,
  windowStart,
  workspaceId,
}: {
  windowEnd: Date;
  windowStart: Date;
  workspaceId: string;
}): Promise<AgentMessageConsumptionAnalyticsData[]> {
  const documents: AgentMessageConsumptionAnalyticsData[] = [];
  let searchAfter: estypes.SortResults | undefined;

  while (true) {
    const result =
      await searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspaceId } },
              {
                range: {
                  completed_at: {
                    gte: windowStart.toISOString(),
                    lte: windowEnd.toISOString(),
                  },
                },
              },
            ],
          },
        },
        {
          size: ES_PAGE_SIZE,
          sort: [
            { completed_at: "asc" },
            { agent_message_id: "asc" },
            { consumption_key: "asc" },
          ],
          search_after: searchAfter,
        }
      );
    if (result.isErr()) {
      throw new Error(
        `Failed to query ${CONSUMPTION_ANALYTICS_ALIAS_NAME}: ${result.error.message}`
      );
    }

    const { hits } = result.value.hits;
    for (const hit of hits) {
      if (hit._source) {
        documents.push(hit._source);
      }
    }

    if (hits.length < ES_PAGE_SIZE) {
      return documents;
    }
    searchAfter = hits[hits.length - 1]?.sort;
  }
}

function buildLegacyCostBreakdown(
  document: LegacyCostDocument
): LegacyCostBreakdown {
  return {
    llmCreditsMicro: document.cost
      ? roundCreditsToMicroCredits(document.cost.llm_awu)
      : null,
    status: document.status,
    timestamp: document.timestamp,
    toolCharges: (document.tools_used ?? []).map((tool) => ({
      creditsMicro: roundCreditsToMicroCredits(tool.cost_awu),
      status: tool.status,
      stepIndex: tool.step_index,
      toolName: tool.tool_name,
    })),
    toolCreditsMicro: document.cost
      ? roundCreditsToMicroCredits(document.cost.tool_awu)
      : null,
    totalCreditsMicro: document.cost
      ? roundCreditsToMicroCredits(document.cost.full_awu)
      : null,
    version: document.version,
  };
}

function buildConsumptionCostBreakdown(
  documents: AgentMessageConsumptionAnalyticsData[]
): ConsumptionCostBreakdown {
  const firstDocument = documents[0];
  if (!firstDocument) {
    throw new Error("Cannot build a consumption breakdown without documents");
  }

  let totalCreditsMicro = 0;
  let toolCreditsMicro = 0;
  const toolChargesByActionId = new Map<
    string,
    ToolCharge & { actionId: string }
  >();

  for (const document of documents) {
    totalCreditsMicro += document.credit_micro;

    switch (document.consumption_type) {
      case "llm":
        break;
      case "tool": {
        const creditsMicro = document.gross_credit_micro.direct;
        const previous = toolChargesByActionId.get(document.tool.action_id);
        toolCreditsMicro += creditsMicro;
        toolChargesByActionId.set(document.tool.action_id, {
          actionId: document.tool.action_id,
          creditsMicro: (previous?.creditsMicro ?? 0) + creditsMicro,
          stepIndex: document.step_index,
          toolName: document.tool.name,
        });
        break;
      }
      default:
        assertNever(document);
    }
  }

  return {
    attributionVersions: [
      ...new Set(documents.map((document) => document.attribution_version)),
    ].sort((left, right) => left - right),
    completedAt: firstDocument.completed_at,
    llmCreditsMicro: totalCreditsMicro - toolCreditsMicro,
    messageVersions: [
      ...new Set(documents.map((document) => document.message_version)),
    ].sort(),
    statuses: [...new Set(documents.map((document) => document.status))].sort(),
    toolCharges: [...toolChargesByActionId.values()],
    toolCreditsMicro,
    totalCreditsMicro,
  };
}

function toolChargeSignatures(toolCharges: ToolCharge[]): string[] {
  return toolCharges
    .map(({ creditsMicro, stepIndex, toolName }) =>
      JSON.stringify([stepIndex, toolName, creditsMicro])
    )
    .sort();
}

function findDifferences({
  consumption,
  legacy,
}: {
  consumption: ConsumptionCostBreakdown | undefined;
  legacy: LegacyCostBreakdown | undefined;
}): CostDifference[] {
  if (!legacy) {
    return ["missing_legacy"];
  }
  if (!consumption) {
    return ["missing_consumption"];
  }
  if (legacy.totalCreditsMicro === null) {
    return ["missing_legacy_cost"];
  }

  const differences: CostDifference[] = [];
  if (legacy.totalCreditsMicro !== consumption.totalCreditsMicro) {
    differences.push("total_credits");
  }
  if (legacy.llmCreditsMicro !== consumption.llmCreditsMicro) {
    differences.push("llm_credits");
  }
  if (legacy.toolCreditsMicro !== consumption.toolCreditsMicro) {
    differences.push("tool_credits");
  }
  if (
    JSON.stringify(toolChargeSignatures(legacy.toolCharges)) !==
    JSON.stringify(toolChargeSignatures(consumption.toolCharges))
  ) {
    differences.push("tool_charges");
  }

  return differences;
}

function formatLegacyBreakdown(legacy: LegacyCostBreakdown | undefined) {
  if (!legacy) {
    return null;
  }

  return {
    llmCredits:
      legacy.llmCreditsMicro === null
        ? null
        : microCreditsToCredits(legacy.llmCreditsMicro),
    status: legacy.status,
    timestamp: legacy.timestamp,
    toolCredits:
      legacy.toolCreditsMicro === null
        ? null
        : microCreditsToCredits(legacy.toolCreditsMicro),
    tools: legacy.toolCharges.map(
      ({ creditsMicro, status, stepIndex, toolName }) => ({
        credits: microCreditsToCredits(creditsMicro),
        status,
        stepIndex,
        toolName,
      })
    ),
    totalCredits:
      legacy.totalCreditsMicro === null
        ? null
        : microCreditsToCredits(legacy.totalCreditsMicro),
    version: legacy.version,
  };
}

function formatConsumptionBreakdown(
  consumption: ConsumptionCostBreakdown | undefined
) {
  if (!consumption) {
    return null;
  }

  return {
    attributionVersions: consumption.attributionVersions,
    completedAt: consumption.completedAt,
    llmCredits: microCreditsToCredits(consumption.llmCreditsMicro),
    messageVersions: consumption.messageVersions,
    statuses: consumption.statuses,
    toolCredits: microCreditsToCredits(consumption.toolCreditsMicro),
    tools: consumption.toolCharges.map(
      ({ actionId, creditsMicro, stepIndex, toolName }) => ({
        actionId,
        credits: microCreditsToCredits(creditsMicro),
        stepIndex,
        toolName,
      })
    ),
    totalCredits: microCreditsToCredits(consumption.totalCreditsMicro),
  };
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string",
      demandOption: true,
      description: "Workspace sId to compare.",
    },
    days: {
      type: "number",
      default: DEFAULT_DAYS,
      description: "Number of past days to compare.",
    },
  },
  async ({ days, workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const parsedDays = parseDays(days);
    const windowEnd = new Date();
    const windowStart = new Date(
      windowEnd.getTime() - parsedDays * DAY_DURATION_MS
    );
    const [legacyDocuments, consumptionDocuments] = await Promise.all([
      fetchLegacyDocuments({
        windowEnd,
        windowStart,
        workspaceId: workspace.sId,
      }),
      fetchConsumptionDocuments({
        windowEnd,
        windowStart,
        workspaceId: workspace.sId,
      }),
    ]);

    const legacyByMessageId = new Map(
      legacyDocuments.map((document) => [
        document.message_id,
        buildLegacyCostBreakdown(document),
      ])
    );
    const consumptionDocumentsByMessageId = new Map<
      string,
      AgentMessageConsumptionAnalyticsData[]
    >();
    for (const document of consumptionDocuments) {
      const messageDocuments =
        consumptionDocumentsByMessageId.get(document.agent_message_id) ?? [];
      messageDocuments.push(document);
      consumptionDocumentsByMessageId.set(
        document.agent_message_id,
        messageDocuments
      );
    }
    const consumptionByMessageId = new Map(
      [...consumptionDocumentsByMessageId.entries()].map(
        ([messageId, documents]) => [
          messageId,
          buildConsumptionCostBreakdown(documents),
        ]
      )
    );

    const messageIds = [
      ...new Set([
        ...legacyByMessageId.keys(),
        ...consumptionByMessageId.keys(),
      ]),
    ].sort();
    const differenceCounts: Record<CostDifference, number> = {
      llm_credits: 0,
      missing_consumption: 0,
      missing_legacy: 0,
      missing_legacy_cost: 0,
      tool_charges: 0,
      tool_credits: 0,
      total_credits: 0,
    };
    const mismatchSamples: Array<{
      consumption: ReturnType<typeof formatConsumptionBreakdown>;
      differences: CostDifference[];
      legacy: ReturnType<typeof formatLegacyBreakdown>;
      messageId: string;
    }> = [];
    let mismatchedMessageCount = 0;

    for (const messageId of messageIds) {
      const legacy = legacyByMessageId.get(messageId);
      const consumption = consumptionByMessageId.get(messageId);
      const differences = findDifferences({ consumption, legacy });
      if (differences.length === 0) {
        continue;
      }

      mismatchedMessageCount += 1;
      for (const difference of differences) {
        differenceCounts[difference] += 1;
      }
      if (mismatchSamples.length < MAX_MISMATCH_SAMPLES) {
        mismatchSamples.push({
          consumption: formatConsumptionBreakdown(consumption),
          differences,
          legacy: formatLegacyBreakdown(legacy),
          messageId,
        });
      }
    }

    for (const mismatch of mismatchSamples) {
      logger.warn(
        mismatch,
        "Agent message cost differs between analytics indices"
      );
    }

    const summary = {
      workspaceId: workspace.sId,
      days: parsedDays,
      fromDate: windowStart.toISOString(),
      toDate: windowEnd.toISOString(),
      legacyMessageCount: legacyByMessageId.size,
      consumptionMessageCount: consumptionByMessageId.size,
      comparedMessageCount: messageIds.length,
      mismatchedMessageCount,
      differenceCounts,
      loggedMismatchSampleCount: mismatchSamples.length,
    };

    if (messageIds.length === 0) {
      logger.warn(summary, "No agent message cost data found in either index");
      return;
    }

    if (mismatchedMessageCount > 0) {
      logger.error(summary, "Agent message cost comparison failed");
      return;
    }

    logger.info(summary, "Agent message costs match across analytics indices");
  }
);
