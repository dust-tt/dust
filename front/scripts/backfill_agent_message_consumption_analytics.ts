/**
 * Enqueue the consumption attribution + Elasticsearch indexing workflow for historical agent
 * messages. Run once in each region after the consumption analytics index and V3 analytics worker
 * have been deployed.
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
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { launchStoreAgentMessageConsumptionAttributionWorkflow } from "@app/temporal/analytics_queue/client";
import type { AgentMessageRef } from "@app/types/assistant/agent_run";
import {
  AGENT_MESSAGE_STATUSES_TO_TRACK,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
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

async function listAgentMessageRefs({
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
}): Promise<Array<{ agentMessageModelId: number; message: AgentMessageRef }>> {
  const agentMessages = await AgentMessageModel.findAll({
    attributes: ["id"],
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
        attributes: ["sId"],
        required: true,
        include: [
          {
            model: ConversationModel,
            as: "conversation",
            attributes: ["sId"],
            required: true,
          },
        ],
      },
    ],
    order: [["id", "ASC"]],
    limit: batchSize,
  });

  return agentMessages.map((agentMessage) => {
    const message = agentMessage.message;
    const conversation = message?.conversation;
    assert(message && conversation, "Agent message context was not joined");

    return {
      agentMessageModelId: agentMessage.id,
      message: {
        agentMessageId: message.sId,
        conversationId: conversation.sId,
      },
    };
  });
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

    await runOnAllWorkspaces(
      async (workspace) => {
        const auth = await Authenticator.internalBuilderForWorkspace(
          workspace.sId
        );

        let afterAgentMessageModelId = 0;
        let workspaceCandidates = 0;
        let workspaceEnqueued = 0;
        let workspaceFailed = 0;

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
              afterAgentMessageModelId,
            },
            "[ConsumptionAnalyticsBackfill] Batch complete"
          );
        }

        totalCandidates += workspaceCandidates;
        totalEnqueued += workspaceEnqueued;
        totalFailed += workspaceFailed;

        logger.info(
          {
            workspaceId: workspace.sId,
            workspaceCandidates,
            workspaceEnqueued,
            workspaceFailed,
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
