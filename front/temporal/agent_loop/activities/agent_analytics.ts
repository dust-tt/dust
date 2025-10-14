import assert from "assert";

import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { AgentMessageType } from "@app/types";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import { getAgentLoopData } from "@app/types/assistant/agent_run";
import type {
  AgentAnalyticsData,
  AgentAnalyticsTokens,
  AgentAnalyticsToolUsed,
} from "@app/types/assistant/analytics";

/**
 * Store agent analytics data to Elasticsearch by collecting data from database
 */
export async function storeAgentAnalyticsActivity(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
    status,
    latencyMs,
  }: {
    agentLoopArgs: AgentLoopArgsWithTiming;
    status: string;
    latencyMs: number;
  }
): Promise<void> {
  try {
    const auth = await Authenticator.fromJSON(authType);
    const workspace = auth.getNonNullableWorkspace();

    const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
    if (runAgentDataRes.isErr()) {
      throw runAgentDataRes.error;
    }

    const {
      agentConfiguration,
      agentMessage,
      conversation,
      userMessage,
      agentMessageRow,
    } = runAgentDataRes.value;

    // Collect token usage from run data
    const tokens = await collectTokenUsage(auth, agentMessageRow);

    // Collect tool usage data from the agent message actions
    const toolsUsed = await collectToolUsageFromMessage(auth, agentMessage);

    // Build the complete analytics document
    const document: AgentAnalyticsData = {
      message_id: agentMessage.sId,
      workspace_id: workspace.sId,
      conversation_id: conversation.sId,
      agent_id: agentConfiguration.sId,
      agent_version: agentConfiguration.version.toString(),
      user_id: userMessage.user?.sId ?? "unknown",
      timestamp: new Date(userMessage.created).toISOString(),
      status,
      latency_ms: latencyMs,
      tokens,
      tools_used: toolsUsed,
    };

    await storeToElasticsearch(document);

    logger.info(
      {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
        agentId: agentConfiguration.sId,
        toolsUsedCount: document.tools_used.length,
        latency: document.latency_ms,
        totalTokens:
          document.tokens.prompt +
          document.tokens.completion +
          document.tokens.reasoning,
      },
      "Agent analytics stored successfully"
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        agentLoopArgs,
      },
      "Failed to store agent analytics"
    );
    // Don't throw - we don't want analytics failures to break the agent loop
  }
}

/**
 * Collect token usage from runs associated with this agent message
 */
async function collectTokenUsage(
  auth: Authenticator,
  agentMessage: AgentMessage
): Promise<AgentAnalyticsTokens> {
  try {
    if (!agentMessage.runIds || agentMessage.runIds.length === 0) {
      return {
        prompt: 0,
        completion: 0,
        reasoning: 0,
        cached: 0,
      };
    }

    // Get run usages for all runs associated with this agent message
    const runResources = await RunResource.listByDustRunIds(auth, {
      dustRunIds: agentMessage.runIds,
    });
    const runUsages = (
      await concurrentExecutor(
        runResources,
        async (runResource) => {
          const runUsages = await runResource.listRunUsages(auth);
          return runUsages;
        },
        { concurrency: 5 }
      )
    ).flat();

    return runUsages.reduce(
      (acc, usage) => ({
        prompt: acc.prompt + usage.promptTokens,
        completion: acc.completion + usage.completionTokens,
        reasoning: acc.reasoning + 0, // No reasoning tokens in RunUsageType yet
        cached: acc.cached + (usage.cachedTokens ?? 0),
      }),
      {
        prompt: 0,
        completion: 0,
        reasoning: 0,
        cached: 0,
      }
    );
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        agentMessageId: agentMessage.id,
      },
      "Failed to collect token usage, returning zeros"
    );
    return {
      prompt: 0,
      completion: 0,
      reasoning: 0,
      cached: 0,
    };
  }
}

/**
 * Collect tool usage data from agent message actions
 */
async function collectToolUsageFromMessage(
  auth: Authenticator,
  agentMessage: AgentMessageType
): Promise<AgentAnalyticsToolUsed[]> {
  const res = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentMessage.agentMessageId,
  ]);

  return agentMessage.actions.map((action) => {
    // Look up the corresponding action resource to get more details.
    const actionResource = res.find(
      (r) =>
        r.agentMessageId === agentMessage.agentMessageId && r.id === action.id
    );

    console.log("Action resource found:", actionResource?.toJSON());

    assert(actionResource, "Action resource not found for action");

    const executionTimeMs =
      actionResource?.updatedAt.getTime() - actionResource?.createdAt.getTime();

    return {
      step_index: action.step,
      server_name:
        action.internalMCPServerName ?? action.mcpServerId ?? "unknown",
      tool_name:
        action.functionCallName.split("__").pop() ?? action.functionCallName,
      execution_time_ms: executionTimeMs,
      status: action.status,
    };
  });
}

/**
 * Store document to JSONL file for bulk Elasticsearch indexing
 */
async function storeToElasticsearch(
  document: AgentAnalyticsData
): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");

  // Create output directory if it doesn't exist
  const outputDir = path.join(process.cwd(), "analytics_output");
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore
  }

  // Generate filename with timestamp and workspace
  const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const filename = `agent_analytics_${document.workspace_id}_${timestamp}.jsonl`;
  const filePath = path.join(outputDir, filename);

  // Prepare the Elasticsearch bulk index action
  const indexAction = {
    index: {
      _index: "agent-analytics",
      _id: `${document.workspace_id}_${document.message_id}_${document.timestamp}`,
    },
  };

  // Write both the index action and the document (JSONL format)
  const jsonlLine =
    JSON.stringify(indexAction) + "\n" + JSON.stringify(document) + "\n";

  try {
    await fs.appendFile(filePath, jsonlLine);
    logger.debug(
      {
        filePath,
        messageId: document.message_id,
        workspaceId: document.workspace_id,
      },
      "Document appended to JSONL file for bulk indexing"
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        filePath,
        messageId: document.message_id,
      },
      "Failed to write to JSONL file"
    );
    throw error;
  }
}
