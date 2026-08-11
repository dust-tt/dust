/**
 * Enqueue the consumption attribution + Elasticsearch indexing workflow for historical agent
 * messages. Run once in each region after the consumption analytics index and V3 analytics worker
 * have been deployed, and after agent step content dustRunIds have been backfilled.
 *
 * Before enqueueing each batch, the script classifies any run usages whose usageType is still null.
 * It reconstructs the same billing classification as the live path from the triggering user
 * message's persisted origin and auth method. This is required because the analytics loader rejects
 * unclassified usage rather than risking that free, user, and programmatic consumption are mixed.
 *
 * Dry run:
 *   npx tsx scripts/backfill_agent_message_consumption_analytics.ts \
 *     --fromDate 2026-08-01T00:00:00.000Z
 *
 * Execute:
 *   npx tsx scripts/backfill_agent_message_consumption_analytics.ts \
 *     --fromDate 2026-08-01T00:00:00.000Z \
 *     --execute
 */
import {
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import { isProgrammaticUsageFromContext } from "@app/lib/api/programmatic_usage/common";
import { Authenticator } from "@app/lib/auth";
import { getUsageType } from "@app/lib/metronome/events";
import type { UsageType } from "@app/lib/metronome/types";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { launchStoreAgentMessageConsumptionAttributionWorkflow } from "@app/temporal/analytics_queue/client";
import type { AgentMessageRef } from "@app/types/assistant/agent_run";
import {
  AGENT_MESSAGE_STATUSES_TO_TRACK,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import { Op } from "sequelize";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 4;
const TERMINAL_TRACKED_STATUSES = AGENT_MESSAGE_STATUSES_TO_TRACK.filter(
  isTerminalAgentMessageStatus
);
const TimestampSchema = z.string().datetime({ offset: true });

type AgentMessageBackfillCandidate = {
  agentMessageModelId: ModelId;
  dustRunIds: string[];
  message: AgentMessageRef;
  usageType: UsageType;
};

function parseTimestamp(value: string, argumentName: string): Date {
  const result = TimestampSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid --${argumentName}: ${fromError(result.error).toString()}`
    );
  }

  return new Date(result.data);
}

async function assertConsumptionAnalyticsIndexExists(): Promise<void> {
  const result = await withEs((client) =>
    client.indices.exists({ index: CONSUMPTION_ANALYTICS_ALIAS_NAME })
  );
  if (result.isErr()) {
    throw result.error;
  }
  if (!result.value) {
    throw new Error(
      `Elasticsearch index alias does not exist: ${CONSUMPTION_ANALYTICS_ALIAS_NAME}`
    );
  }
}

export async function listAgentMessageRefs({
  afterAgentMessageModelId,
  batchSize,
  fromDate,
  toDate,
  workspace,
}: {
  afterAgentMessageModelId: number;
  batchSize: number;
  fromDate: Date;
  toDate: Date;
  workspace: LightWorkspaceType;
}): Promise<AgentMessageBackfillCandidate[]> {
  const agentMessages = await AgentMessageModel.findAll({
    attributes: ["id", "runIds"],
    where: {
      id: { [Op.gt]: afterAgentMessageModelId },
      workspaceId: workspace.id,
      status: { [Op.in]: TERMINAL_TRACKED_STATUSES },
      completedAt: { [Op.gte]: fromDate, [Op.lt]: toDate },
      costCredits: { [Op.ne]: null },
      runIds: { [Op.ne]: null },
    },
    include: [
      {
        model: MessageModel,
        as: "message",
        attributes: ["sId", "parentId"],
        required: true,
        include: [
          {
            model: ConversationModel,
            as: "conversation",
            attributes: ["sId"],
            required: true,
            where: {
              workspaceId: workspace.id,
            },
          },
        ],
      },
    ],
    order: [["id", "ASC"]],
    limit: batchSize,
  });

  const triggeringMessages = await MessageModel.findAll({
    attributes: ["id"],
    where: {
      id: {
        [Op.in]: agentMessages.map((agentMessage) => {
          assert(agentMessage.message?.parentId, "Agent message has no parent");
          return agentMessage.message.parentId;
        }),
      },
      workspaceId: workspace.id,
    },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        attributes: ["userContextAuthMethod", "userContextOrigin"],
        required: true,
      },
    ],
  });
  const triggeringMessageById = new Map(
    triggeringMessages.map((message) => [message.id, message])
  );

  return agentMessages.map((agentMessage) => {
    const message = agentMessage.message;
    const conversation = message?.conversation;
    assert(message && conversation, "Agent message context was not joined");
    assert(message.parentId, "Agent message has no parent");
    const triggeringUserMessage = triggeringMessageById.get(
      message.parentId
    )?.userMessage;
    assert(triggeringUserMessage, "Triggering user message was not joined");
    const dustRunIds = [...new Set(agentMessage.runIds ?? [])];
    const origin = triggeringUserMessage.userContextOrigin;

    return {
      agentMessageModelId: agentMessage.id,
      dustRunIds,
      message: {
        agentMessageId: message.sId,
        conversationId: conversation.sId,
      },
      usageType: getUsageType(
        isProgrammaticUsageFromContext({
          authMethod: triggeringUserMessage.userContextAuthMethod,
          userMessageOrigin: origin,
        }),
        origin
      ),
    };
  });
}

async function backfillMissingRunUsageTypes({
  candidates,
  workspace,
}: {
  candidates: AgentMessageBackfillCandidate[];
  workspace: LightWorkspaceType;
}): Promise<number> {
  const usageTypeByDustRunId = new Map<string, UsageType>();
  for (const candidate of candidates) {
    for (const dustRunId of candidate.dustRunIds) {
      const existingUsageType = usageTypeByDustRunId.get(dustRunId);
      assert(
        !existingUsageType || existingUsageType === candidate.usageType,
        `Run ${dustRunId} has conflicting usage classifications`
      );
      usageTypeByDustRunId.set(dustRunId, candidate.usageType);
    }
  }
  if (usageTypeByDustRunId.size === 0) {
    return 0;
  }

  const runs = await RunModel.findAll({
    attributes: ["id", "dustRunId"],
    where: {
      dustRunId: { [Op.in]: [...usageTypeByDustRunId.keys()] },
      workspaceId: workspace.id,
    },
  });
  const runModelIdsByUsageType = new Map<UsageType, ModelId[]>();
  for (const run of runs) {
    const usageType = usageTypeByDustRunId.get(run.dustRunId);
    assert(usageType, "Fetched run has no usage classification");
    const runModelIds = runModelIdsByUsageType.get(usageType) ?? [];
    runModelIds.push(run.id);
    runModelIdsByUsageType.set(usageType, runModelIds);
  }

  const updateCounts = await Promise.all(
    [...runModelIdsByUsageType].map(async ([usageType, runModelIds]) => {
      const [updatedCount] = await RunUsageModel.update(
        { usageType },
        {
          where: {
            runId: { [Op.in]: runModelIds },
            usageType: null,
            workspaceId: workspace.id,
          },
        }
      );
      return updatedCount;
    })
  );

  return updateCounts.reduce((total, count) => total + count, 0);
}

makeScript(
  {
    fromDate: {
      type: "string",
      required: true,
      description: "Inclusive ISO-8601 completion timestamp.",
    },
    toDate: {
      type: "string",
      required: false,
      description:
        "Exclusive ISO-8601 completion timestamp (defaults to script start).",
    },
    workspaceId: {
      type: "string",
      required: false,
      description: "Single workspace sId to process (all if omitted).",
    },
    fromWorkspaceId: {
      type: "number",
      required: false,
      description: "Resume from this workspace model id.",
    },
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      description: "Number of agent messages to fetch per database query.",
    },
    concurrency: {
      type: "number",
      default: DEFAULT_CONCURRENCY,
      description: "Maximum concurrent Temporal workflow launches.",
    },
  },
  async (
    {
      batchSize,
      concurrency,
      execute,
      fromDate,
      fromWorkspaceId,
      toDate,
      workspaceId,
    },
    logger
  ) => {
    const parsedFromDate = parseTimestamp(fromDate, "fromDate");
    const parsedToDate = toDate ? parseTimestamp(toDate, "toDate") : new Date();
    assert(parsedFromDate < parsedToDate, "--fromDate must precede --toDate");
    assert(batchSize > 0, "--batchSize must be positive");
    assert(concurrency > 0, "--concurrency must be positive");

    if (execute) {
      await assertConsumptionAnalyticsIndexExists();
    }

    let totalCandidates = 0;
    let totalEnqueued = 0;
    let totalFailed = 0;
    let totalUsageTypesBackfilled = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const auth = await Authenticator.internalBuilderForWorkspace(
          workspace.sId
        );

        let afterAgentMessageModelId = 0;
        let workspaceCandidates = 0;
        let workspaceEnqueued = 0;
        let workspaceFailed = 0;
        let workspaceUsageTypesBackfilled = 0;

        while (true) {
          const candidates = await listAgentMessageRefs({
            afterAgentMessageModelId,
            batchSize,
            fromDate: parsedFromDate,
            toDate: parsedToDate,
            workspace,
          });
          if (candidates.length === 0) {
            break;
          }

          afterAgentMessageModelId =
            candidates[candidates.length - 1].agentMessageModelId;
          workspaceCandidates += candidates.length;

          if (!execute) {
            continue;
          }

          workspaceUsageTypesBackfilled += await backfillMissingRunUsageTypes({
            candidates,
            workspace,
          });

          const results = await concurrentExecutor(
            candidates,
            async ({ message }) => {
              const result =
                await launchStoreAgentMessageConsumptionAttributionWorkflow({
                  authType: auth.toJSON(),
                  message,
                });
              if (result.isErr()) {
                logger.error(
                  {
                    error: result.error,
                    workspaceId: workspace.sId,
                    ...message,
                  },
                  "[ConsumptionAnalyticsBackfill] Failed to enqueue workflow"
                );
                return false;
              }

              return true;
            },
            { concurrency }
          );
          workspaceEnqueued += results.filter(Boolean).length;
          workspaceFailed += results.filter((succeeded) => !succeeded).length;

          logger.info(
            {
              workspaceId: workspace.sId,
              workspaceCandidates,
              workspaceEnqueued,
              workspaceFailed,
              workspaceUsageTypesBackfilled,
              afterAgentMessageModelId,
            },
            "[ConsumptionAnalyticsBackfill] Batch complete"
          );
        }

        totalCandidates += workspaceCandidates;
        totalEnqueued += workspaceEnqueued;
        totalFailed += workspaceFailed;
        totalUsageTypesBackfilled += workspaceUsageTypesBackfilled;

        logger.info(
          {
            workspaceId: workspace.sId,
            workspaceCandidates,
            workspaceEnqueued,
            workspaceFailed,
            workspaceUsageTypesBackfilled,
            execute,
          },
          "[ConsumptionAnalyticsBackfill] Workspace complete"
        );
      },
      { wId: workspaceId, fromWorkspaceId }
    );

    logger.info(
      {
        fromDate: parsedFromDate.toISOString(),
        toDate: parsedToDate.toISOString(),
        totalCandidates,
        totalEnqueued,
        totalFailed,
        totalUsageTypesBackfilled,
        execute,
      },
      execute
        ? "[ConsumptionAnalyticsBackfill] Enqueue complete"
        : "[ConsumptionAnalyticsBackfill] Dry run complete"
    );

    if (totalFailed > 0) {
      throw new Error(
        `${totalFailed} consumption analytics workflow launches failed`
      );
    }
  }
);
