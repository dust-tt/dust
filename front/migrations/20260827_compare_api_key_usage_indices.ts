import { TOOL_EXECUTION_BLOCKED_STATUSES } from "@app/lib/actions/statuses";
import {
  ANALYTICS_ALIAS_NAME,
  bucketsToArray,
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { AgentMessageAnalyticsData } from "@app/types/assistant/analytics";
import type { estypes } from "@elastic/elasticsearch";
import { Op } from "sequelize";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const MAX_API_KEY_NAMES = 10_000;
const MAX_DIAGNOSTIC_SAMPLES = 20;
const ES_PAGE_SIZE = 1_000;
const DEFAULT_DAYS = 90;
const DAY_DURATION_MS = 24 * 60 * 60 * 1000;
const DaysSchema = z.number().int().positive();

type ApiKeyCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
  by_status?: StatusCreditsTermsAggregate;
};

type StatusCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type StatusCreditsTermsAggregate =
  estypes.AggregationsTermsAggregateBase<StatusCreditsBucket>;

type ApiKeyCreditsTermsAggregate =
  estypes.AggregationsTermsAggregateBase<ApiKeyCreditsBucket>;

type ApiKeyCreditsAggs = {
  by_api_key_name?: ApiKeyCreditsTermsAggregate;
};

type LegacyCreatedDocument = AgentMessageAnalyticsData & {
  api_key_name?: string;
};

const BLOCKED_ACTION_STATUSES = new Set<string>(
  TOOL_EXECUTION_BLOCKED_STATUSES
);

function parseDays(value: number): number {
  const result = DaysSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid --days: ${fromError(result.error).toString()}`);
  }

  return result.data;
}

function assertCompleteAggregation(
  aggregation: ApiKeyCreditsTermsAggregate | undefined,
  indexName: string
): void {
  if ((aggregation?.sum_other_doc_count ?? 0) > 0) {
    throw new Error(
      `${indexName} contains more than ${MAX_API_KEY_NAMES} API key names for this window; ` +
        "the comparison would be incomplete."
    );
  }
  if ((aggregation?.doc_count_error_upper_bound ?? 0) > 0) {
    throw new Error(
      `${indexName} returned approximate API key buckets; the comparison would be incomplete.`
    );
  }
}

function totalMicroCredits(creditsByApiKeyName: Map<string, number>): number {
  return [...creditsByApiKeyName.values()].reduce(
    (total, creditsMicro) => total + creditsMicro,
    0
  );
}

async function fetchLegacyCreatedDocuments({
  apiKeyNames,
  workspaceId,
  windowEnd,
  windowStart,
}: {
  apiKeyNames: string[];
  workspaceId: string;
  windowEnd: Date;
  windowStart: Date;
}): Promise<LegacyCreatedDocument[]> {
  const documents: LegacyCreatedDocument[] = [];
  let searchAfter: estypes.SortResults | undefined;

  while (true) {
    const result = await searchAnalytics<LegacyCreatedDocument>(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspaceId } },
            { term: { status: "created" } },
            { terms: { api_key_name: apiKeyNames } },
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
        `Failed to query created documents in ${ANALYTICS_ALIAS_NAME}: ${result.error.message}`
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

    const [legacyResult, consumptionResult] = await Promise.all([
      searchAnalytics<never, ApiKeyCreditsAggs>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
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
          aggregations: {
            by_api_key_name: {
              terms: { field: "api_key_name", size: MAX_API_KEY_NAMES },
              aggs: {
                credits: { sum: { field: "cost.billable_awu" } },
                by_status: {
                  terms: { field: "status", size: 10 },
                  aggs: {
                    credits: { sum: { field: "cost.billable_awu" } },
                  },
                },
              },
            },
          },
          size: 0,
        }
      ),
      searchConsumptionAnalytics<never, ApiKeyCreditsAggs>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
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
          aggregations: {
            by_api_key_name: {
              terms: { field: "api_key_name", size: MAX_API_KEY_NAMES },
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

    const legacyAggregation = legacyResult.value.aggregations?.by_api_key_name;
    const consumptionAggregation =
      consumptionResult.value.aggregations?.by_api_key_name;
    assertCompleteAggregation(legacyAggregation, ANALYTICS_ALIAS_NAME);
    assertCompleteAggregation(
      consumptionAggregation,
      CONSUMPTION_ANALYTICS_ALIAS_NAME
    );

    const legacyBuckets = bucketsToArray<ApiKeyCreditsBucket>(
      legacyAggregation?.buckets
    );
    const legacyByApiKeyName = new Map(
      legacyBuckets.map((bucket) => [
        String(bucket.key),
        roundCreditsToMicroCredits(bucket.credits?.value ?? 0),
      ])
    );
    const legacyCreditsByStatusByApiKeyName = new Map(
      legacyBuckets.map((bucket) => [
        String(bucket.key),
        Object.fromEntries(
          bucketsToArray<StatusCreditsBucket>(bucket.by_status?.buckets).map(
            (statusBucket) => [
              String(statusBucket.key),
              statusBucket.credits?.value ?? 0,
            ]
          )
        ),
      ])
    );
    const consumptionByApiKeyName = new Map(
      bucketsToArray<ApiKeyCreditsBucket>(consumptionAggregation?.buckets).map(
        (bucket) => [String(bucket.key), Math.round(bucket.credits?.value ?? 0)]
      )
    );
    const apiKeyNames = [
      ...new Set([
        ...legacyByApiKeyName.keys(),
        ...consumptionByApiKeyName.keys(),
      ]),
    ].sort();

    const mismatches = apiKeyNames.flatMap((apiKeyName) => {
      const legacyCreditsMicro = legacyByApiKeyName.get(apiKeyName) ?? 0;
      const consumptionCreditsMicro =
        consumptionByApiKeyName.get(apiKeyName) ?? 0;

      return legacyCreditsMicro === consumptionCreditsMicro
        ? []
        : [
            {
              apiKeyName,
              legacyCredits: microCreditsToCredits(legacyCreditsMicro),
              legacyCreditsByStatus:
                legacyCreditsByStatusByApiKeyName.get(apiKeyName) ?? {},
              consumptionCredits: microCreditsToCredits(
                consumptionCreditsMicro
              ),
              deltaCredits: microCreditsToCredits(
                consumptionCreditsMicro - legacyCreditsMicro
              ),
            },
          ];
    });

    for (const mismatch of mismatches) {
      logger.warn(mismatch, "API key usage differs between analytics indices");
    }

    const apiKeyNamesWithLegacyCreatedCredits = mismatches.flatMap(
      ({ apiKeyName, legacyCreditsByStatus }) =>
        (legacyCreditsByStatus.created ?? 0) > 0 ? [apiKeyName] : []
    );
    if (apiKeyNamesWithLegacyCreatedCredits.length > 0) {
      const legacyCreatedDocuments = await fetchLegacyCreatedDocuments({
        apiKeyNames: apiKeyNamesWithLegacyCreatedCredits,
        workspaceId: workspace.sId,
        windowEnd,
        windowStart,
      });
      const legacyCreatedMessageIds = [
        ...new Set(legacyCreatedDocuments.map(({ message_id }) => message_id)),
      ];

      const currentMessageRows = await MessageModel.findAll({
        attributes: ["sId", "version", "agentMessageId"],
        where: {
          sId: { [Op.in]: legacyCreatedMessageIds },
          workspaceId: workspace.id,
        },
        include: [
          {
            model: AgentMessageModel,
            as: "agentMessage",
            attributes: [
              "id",
              "status",
              "completedAt",
              "costCredits",
              "updatedAt",
            ],
            required: true,
          },
        ],
      });

      const currentMessageByMessageId = new Map<
        string,
        {
          agentMessageModelId: number;
          completedAt: Date | null;
          costCredits: number | null;
          status: AgentMessageModel["status"];
          updatedAt: Date;
          version: number;
        }
      >();
      for (const messageRow of currentMessageRows) {
        if (messageRow.agentMessage) {
          currentMessageByMessageId.set(messageRow.sId, {
            agentMessageModelId: messageRow.agentMessage.id,
            completedAt: messageRow.agentMessage.completedAt,
            costCredits: messageRow.agentMessage.costCredits,
            status: messageRow.agentMessage.status,
            updatedAt: messageRow.agentMessage.updatedAt,
            version: messageRow.version,
          });
        }
      }

      const agentMessageModelIds = currentMessageRows.flatMap(
        ({ agentMessage }) => (agentMessage ? [agentMessage.id] : [])
      );
      const actionRows = await AgentMCPActionModel.findAll({
        attributes: [
          "agentMessageId",
          "status",
          "toolConfiguration",
          "updatedAt",
        ],
        where: {
          agentMessageId: { [Op.in]: agentMessageModelIds },
          workspaceId: workspace.id,
        },
      });
      const blockedActionsByAgentMessageModelId = new Map<
        number,
        Array<{ status: string; toolName: string; updatedAt: Date }>
      >();
      for (const actionRow of actionRows) {
        if (!BLOCKED_ACTION_STATUSES.has(actionRow.status)) {
          continue;
        }
        const blockedActions =
          blockedActionsByAgentMessageModelId.get(actionRow.agentMessageId) ??
          [];
        blockedActions.push({
          status: actionRow.status,
          toolName: actionRow.toolConfiguration.name,
          updatedAt: actionRow.updatedAt,
        });
        blockedActionsByAgentMessageModelId.set(
          actionRow.agentMessageId,
          blockedActions
        );
      }

      const legacyCreatedDocumentsByApiKeyName = new Map<
        string,
        LegacyCreatedDocument[]
      >();
      for (const document of legacyCreatedDocuments) {
        if (!document.api_key_name) {
          continue;
        }
        const documents =
          legacyCreatedDocumentsByApiKeyName.get(document.api_key_name) ?? [];
        documents.push(document);
        legacyCreatedDocumentsByApiKeyName.set(
          document.api_key_name,
          documents
        );
      }

      for (const apiKeyName of apiKeyNamesWithLegacyCreatedCredits) {
        const documents =
          legacyCreatedDocumentsByApiKeyName.get(apiKeyName) ?? [];
        const legacyMicroCreditsByCurrentState = new Map<string, number>();
        let legacyCreatedMicroCredits = 0;

        const samples = documents
          .map((document) => {
            const legacyMicroCredits = roundCreditsToMicroCredits(
              document.cost.billable_awu
            );
            legacyCreatedMicroCredits += legacyMicroCredits;

            const currentMessage = currentMessageByMessageId.get(
              document.message_id
            );
            const blockedActions = currentMessage
              ? (blockedActionsByAgentMessageModelId.get(
                  currentMessage.agentMessageModelId
                ) ?? [])
              : [];
            const blockingState =
              [...new Set(blockedActions.map(({ status }) => status))]
                .sort()
                .join("+") || "no_blocked_action";
            let currentState = "missing";
            if (currentMessage) {
              currentState =
                currentMessage.status === "created"
                  ? `created:${blockingState}`
                  : `terminal:${currentMessage.status}`;
            }
            legacyMicroCreditsByCurrentState.set(
              currentState,
              (legacyMicroCreditsByCurrentState.get(currentState) ?? 0) +
                legacyMicroCredits
            );

            return {
              messageId: document.message_id,
              legacyTimestamp: document.timestamp,
              legacyVersion: document.version,
              legacyCredits: microCreditsToCredits(legacyMicroCredits),
              currentState,
              currentVersion: currentMessage?.version ?? null,
              currentUpdatedAt: currentMessage?.updatedAt.toISOString() ?? null,
              currentCompletedAt:
                currentMessage?.completedAt?.toISOString() ?? null,
              currentCostCredits: currentMessage?.costCredits ?? null,
              blockedActions: blockedActions.map(
                ({ status, toolName, updatedAt }) => ({
                  status,
                  toolName,
                  updatedAt: updatedAt.toISOString(),
                })
              ),
            };
          })
          .slice(0, MAX_DIAGNOSTIC_SAMPLES);

        logger.warn(
          {
            apiKeyName,
            legacyCreatedMessageCount: documents.length,
            legacyCreatedCredits: microCreditsToCredits(
              legacyCreatedMicroCredits
            ),
            legacyCreatedCreditsByCurrentState: Object.fromEntries(
              [...legacyMicroCreditsByCurrentState.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([currentState, creditsMicro]) => [
                  currentState,
                  microCreditsToCredits(creditsMicro),
                ])
            ),
            samples,
          },
          "Diagnosed legacy created API key usage"
        );
      }
    }

    const legacyTotalMicroCredits = totalMicroCredits(legacyByApiKeyName);
    const consumptionTotalMicroCredits = totalMicroCredits(
      consumptionByApiKeyName
    );
    const summary = {
      workspaceId: workspace.sId,
      days: parsedDays,
      fromDate: windowStart.toISOString(),
      toDate: windowEnd.toISOString(),
      comparedApiKeyNames: apiKeyNames.length,
      mismatchedApiKeyNames: mismatches.length,
      legacyCredits: microCreditsToCredits(legacyTotalMicroCredits),
      consumptionCredits: microCreditsToCredits(consumptionTotalMicroCredits),
      deltaCredits: microCreditsToCredits(
        consumptionTotalMicroCredits - legacyTotalMicroCredits
      ),
    };

    if (apiKeyNames.length === 0) {
      logger.warn(summary, "No API key usage found in either analytics index");
      return;
    }

    if (mismatches.length > 0) {
      logger.error(summary, "API key usage comparison failed");
      return;
    }

    logger.info(summary, "API key usage matches across analytics indices");
  }
);
