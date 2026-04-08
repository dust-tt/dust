/**
 * Backfill Metronome usage events (llm_usage_v2 / tool_use_v2) for all
 * completed agent messages from the last N days.
 *
 * Directly builds and ingests events — no Temporal workflows.
 *
 * Usage:
 *   npx tsx migrations/20260408_backfill_metronome_events.ts [--days 30] [--until <ISO>] [--execute] [-w workspaceSId]
 *
 * Without --execute, runs in dry-run mode (counts messages, no events emitted).
 */

import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { USAGE_ORIGINS_CLASSIFICATION } from "@app/lib/api/programmatic_usage/common";
import { Authenticator } from "@app/lib/auth";
import { ingestMetronomeEvents } from "@app/lib/metronome/client";
import type { MetronomeEvent } from "@app/lib/metronome/types";
import {
  buildLlmUsageEvents,
  buildToolUseEvents,
  getToolCategory,
} from "@app/lib/metronome/events";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { createHash } from "crypto";
import { Op } from "sequelize";

const BATCH_SIZE = 2000;

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  since: Date,
  until: Date | undefined,
  execute: boolean,
  logger: Logger
): Promise<{
  total: number;
  emitted: number;
  skipped: number;
  errors: number;
}> {
  let total = 0;
  let emitted = 0;
  let skipped = 0;
  let errors = 0;
  let lastId = 0;

  const INGEST_BATCH_SIZE = 100;
  let pendingEvents: MetronomeEvent[] = [];

  async function flushEvents() {
    if (pendingEvents.length === 0) {
      return;
    }
    await ingestMetronomeEvents(pendingEvents);
    emitted += pendingEvents.length;
    pendingEvents = [];
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  logger.info(
    { workspaceId: workspace.sId, workspaceModelId: workspace.id },
    "Starting workspace"
  );

  // Cache conversation numeric id → sId to avoid repeated lookups.
  const conversationSIdCache = new Map<number, string>();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Query agent messages with a subquery on AgentMessageModel to avoid
    // expensive joins. ConversationModel sId resolved from cache.
    const rows = await MessageModel.findAll({
      where: {
        id: { [Op.gt]: lastId },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: true,
          where: {
            status: ["succeeded", "cancelled", "gracefully_stopped"],
            updatedAt: {
              [Op.gte]: since,
              ...(until ? { [Op.lt]: until } : {}),
            },
          },
        },
      ],
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (rows.length === 0) {
      break;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        batchSize: rows.length,
        lastId,
        total,
        emitted,
        skipped,
        errors,
      },
      "Processing batch"
    );

    // Pre-fetch all parent user messages for this batch in one query.
    const parentIds = rows
      .map((r) => r.parentId)
      .filter((id): id is number => id !== null);
    const parentRows =
      parentIds.length > 0
        ? await MessageModel.findAll({
            where: { id: parentIds, workspaceId: workspace.id },
            include: [
              {
                model: UserMessageModel,
                as: "userMessage",
                required: true,
                include: [
                  { model: UserModel, required: false },
                  { model: KeyModel, as: "key", required: false },
                ],
              },
            ],
          })
        : [];
    const parentById = new Map(parentRows.map((r) => [r.id, r]));

    // Pre-fetch conversation sIds for uncached conversations.
    const uncachedConvIds = [
      ...new Set(
        rows
          .map((r) => r.conversationId)
          .filter((id) => !conversationSIdCache.has(id))
      ),
    ];
    if (uncachedConvIds.length > 0) {
      const convs = await ConversationModel.findAll({
        where: { id: uncachedConvIds, workspaceId: workspace.id },
        attributes: ["id", "sId"],
      });
      for (const c of convs) {
        conversationSIdCache.set(c.id, c.sId);
      }
    }

    for (const row of rows) {
      lastId = row.id;
      total++;

      const agentMessage = row.agentMessage;
      if (!agentMessage?.runIds) {
        skipped++;
        continue;
      }

      try {
        const userMessageRow = row.parentId
          ? (parentById.get(row.parentId) ?? null)
          : null;

        if (!userMessageRow?.userMessage) {
          skipped++;
          continue;
        }

        const userMessage = userMessageRow.userMessage;
        const userId = userMessage.user?.sId ?? null;
        const userMessageOrigin: UserMessageOrigin =
          userMessage.userContextOrigin ?? "web";
        const parentAgentMessageId = userMessage.agenticOriginMessageId ?? null;
        const isSubAgentMessage = userMessage.agenticMessageType !== null;
        const authMethod = userMessage.userContextAuthMethod ?? null;
        const agentId = agentMessage.agentConfigurationId ?? null;
        const messageStatus = agentMessage.status ?? "unknown";
        const timestamp = agentMessage.updatedAt.toISOString();

        // Determine programmatic usage from the user message context.
        const isProgrammatic =
          userMessageOrigin !== "zendesk" &&
          (authMethod === "api_key" ||
            USAGE_ORIGINS_CLASSIFICATION[userMessageOrigin] === "programmatic");

        // API key name from the joined KeyModel.
        const apiKeyName = (userMessage as any).key?.name ?? null;

        // Get run usages.
        const runs = await RunResource.listByDustRunIds(auth, {
          dustRunIds: agentMessage.runIds,
        });
        const runUsages = (
          await concurrentExecutor(runs, (run) => run.listRunUsages(auth), {
            concurrency: 10,
          })
        ).flat();

        // Get MCP actions — only final status (succeeded/errored/denied).
        const allMcpActions =
          await AgentMCPActionResource.listByAgentMessageIds(auth, [
            agentMessage.id,
          ]);
        const mcpActions = allMcpActions.filter((a) =>
          isToolExecutionStatusFinal(a.toJSON().status)
        );
        const toolActions = mcpActions.map((a) => {
          const json = a.toJSON();
          return {
            toolName: json.toolName,
            mcpServerId: json.mcpServerId,
            internalMCPServerName: json.internalMCPServerName,
            status: json.status,
            executionDurationMs: json.executionDurationMs,
          };
        });

        // Deterministic runKey — hash of runIds, same as live code.
        const effectiveRunIds = agentMessage.runIds ?? [];
        const runKey = createHash("sha256")
          .update(effectiveRunIds.sort().join(","))
          .digest("hex")
          .slice(0, 8);

        const conversationId =
          conversationSIdCache.get(row.conversationId) ?? "";

        const llmEvents = buildLlmUsageEvents({
          workspaceId: workspace.sId,
          conversationId,
          userId,
          agentMessageId: row.sId,
          agentId,
          parentAgentMessageId,
          runKey,
          runUsages,
          origin: userMessageOrigin,
          isProgrammaticUsage: isProgrammatic,
          authMethod,
          apiKeyName,
          messageStatus,
          isSubAgentMessage,
          timestamp,
        });

        const toolEvents = buildToolUseEvents({
          workspaceId: workspace.sId,
          conversationId,
          userId,
          agentMessageId: row.sId,
          agentId,
          parentAgentMessageId,
          runKey,
          actions: toolActions,
          origin: userMessageOrigin,
          isProgrammaticUsage: isProgrammatic,
          authMethod,
          apiKeyName,
          messageStatus,
          isSubAgentMessage,
          timestamp,
        });

        const allEvents = [...llmEvents, ...toolEvents];

        if (allEvents.length === 0) {
          skipped++;
          continue;
        }

        if (!execute) {
          emitted += allEvents.length;
          continue;
        }

        pendingEvents.push(...allEvents);
        if (pendingEvents.length >= INGEST_BATCH_SIZE) {
          await flushEvents();
        }
      } catch (err) {
        errors++;
        if (errors <= 10) {
          logger.warn(
            { messageId: row.sId, error: String(err) },
            "Error processing message"
          );
        }
      }
    }
  }

  // Flush any remaining events.
  if (execute) {
    await flushEvents();
  }

  return { total, emitted, skipped, errors };
}

makeScript(
  {
    days: {
      alias: "d",
      describe: "Number of days to backfill (default: 30, max: 34)",
      type: "number" as const,
      default: 30,
    },
    until: {
      alias: "u",
      describe:
        "Only backfill messages finalized before this ISO date. Use the deploy time of v2 code to avoid overlap with live events.",
      type: "string" as const,
    },
    wId: {
      type: "string" as const,
      demandOption: false,
      describe:
        "Workspace sId to backfill (optional, processes all if omitted)",
    },
    fromWorkspaceId: {
      type: "number" as const,
      demandOption: false,
      describe:
        "Start from this workspace numeric model id (for resuming interrupted runs)",
    },
  },
  async (args, logger) => {
    const days = Math.min(args.days ?? 30, 34);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const until = args.until ? new Date(args.until) : undefined;

    logger.info(
      {
        days,
        since: since.toISOString(),
        until: until?.toISOString() ?? "now",
        workspaceId: args.wId ?? "all",
        fromWorkspaceId: args.fromWorkspaceId ?? "start",
        execute: args.execute,
      },
      "Starting backfill"
    );

    let grandTotal = 0;
    let grandEmitted = 0;
    let grandSkipped = 0;
    let grandErrors = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const result = await backfillWorkspace(
          workspace,
          since,
          until,
          args.execute,
          logger
        );

        grandTotal += result.total;
        grandEmitted += result.emitted;
        grandSkipped += result.skipped;
        grandErrors += result.errors;

        if (result.total > 0) {
          logger.info(
            {
              workspaceId: workspace.sId,
              workspaceModelId: workspace.id,
              ...result,
            },
            "Workspace done"
          );
        }
      },
      { wId: args.wId, fromWorkspaceId: args.fromWorkspaceId, concurrency: 5 }
    );

    logger.info(
      {
        total: grandTotal,
        emitted: grandEmitted,
        skipped: grandSkipped,
        errors: grandErrors,
        days,
        execute: args.execute,
      },
      args.execute
        ? "Backfill complete"
        : "Dry-run complete — use --execute to emit events"
    );
  }
);
