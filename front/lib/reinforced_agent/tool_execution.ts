import {
  AGENT_SIDEKICK_CONTEXT_TOOL_NAME,
  AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import type {
  ExploratoryToolCallInfo,
  ReinforcedToolCallInfo,
  TerminalToolCallFailure,
  TerminalToolCallSuccess,
} from "@app/lib/reinforced_agent/types";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import type { AgentFunctionCallContentType } from "@app/types/assistant/agent_message_content";
import type { ModelId } from "@app/types/shared/model_id";

/**
 * Info needed by the workflow to call runRetryableToolActivity and
 * then read back the results.
 */
export interface ReinforcedToolActionInfo {
  authType: AuthenticatorType;
  agentLoopArgs: {
    agentMessageId: string;
    agentMessageVersion: number;
    conversationId: string;
    conversationTitle: string | null;
    conversationBranchId: string | null;
    userMessageId: string;
    userMessageVersion: number;
    initialStartTime: number;
  };
  actionIds: ModelId[];
  exploratoryToolCalls: ExploratoryToolCallInfo[];
}

/**
 * Fetch function_call step contents for an agent message and index them by call ID.
 */
async function fetchStepContentByCallId(
  auth: Authenticator,
  agentMessageModelId: ModelId
): Promise<
  Map<
    string,
    AgentStepContentResource & { value: AgentFunctionCallContentType }
  >
> {
  const stepContents = await AgentStepContentResource.fetchByAgentMessages(
    auth,
    { agentMessageIds: [agentMessageModelId], latestVersionsOnly: true }
  );

  const functionCallStepContents = stepContents.filter(
    (
      s
    ): s is AgentStepContentResource & {
      value: AgentFunctionCallContentType;
    } => s.type === "function_call"
  );

  return new Map(functionCallStepContents.map((s) => [s.value.value.id, s]));
}

/**
 * Resolve the MCPServerViewResource sId for the agent_sidekick_context internal server.
 */
async function getAgentSidekickContextViewId(
  auth: Authenticator
): Promise<string> {
  const view = await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
    auth,
    AGENT_SIDEKICK_CONTEXT_TOOL_NAME
  );
  if (!view) {
    throw new Error(
      "MCPServerView not found for agent_sidekick_context internal server"
    );
  }
  return view.sId;
}

/**
 * Create an AgentMCPActionResource for a reinforced tool call.
 */
async function createReinforcedAction(
  auth: Authenticator,
  {
    toolCall,
    agentMessageModelId,
    stepContentId,
    mcpServerViewId,
  }: {
    toolCall: ReinforcedToolCallInfo;
    agentMessageModelId: ModelId;
    stepContentId: ModelId;
    mcpServerViewId: string;
  }
): Promise<AgentMCPActionResource> {
  const meta = AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA[toolCall.name];

  return AgentMCPActionResource.makeNew(auth, {
    agentMessageId: agentMessageModelId,
    augmentedInputs: toolCall.arguments,
    citationsAllocated: 0,
    mcpServerConfigurationId: "agent_sidekick_context",
    status: "ready_allowed_explicitly",
    stepContentId,
    stepContext: {
      citationsCount: 0,
      citationsOffset: 0,
      resumeState: null,
      retrievalTopK: 0,
      websearchResultCount: 0,
    },
    toolConfiguration: {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: toolCall.name,
      originalName: toolCall.name,
      mcpServerName: "agent_sidekick_context",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId,
      dustAppConfiguration: null,
      internalMCPServerId: "agent_sidekick_context",
      secretName: null,
      dustProject: null,
      availability: "auto",
      permission: meta?.stake ?? "never_ask",
      toolServerId: "agent_sidekick_context",
      retryPolicy: "no_retry",
    },
    version: 0,
  });
}

/**
 * Create AgentMCPActionResource records for each exploratory tool call.
 * Returns the info needed by the workflow to call runRetryableToolActivity.
 */
export async function prepareReinforcedToolActions(
  auth: Authenticator,
  {
    exploratoryToolCalls,
    agentMessageModelId,
    agentMessageId,
    userMessageId,
    conversationId,
  }: {
    exploratoryToolCalls: ExploratoryToolCallInfo[];
    agentMessageModelId: ModelId;
    agentMessageId: string;
    userMessageId: string;
    conversationId: string;
  }
): Promise<ReinforcedToolActionInfo> {
  const [stepContentByCallId, mcpServerViewId] = await Promise.all([
    fetchStepContentByCallId(auth, agentMessageModelId),
    getAgentSidekickContextViewId(auth),
  ]);

  const actionIds: ModelId[] = [];
  for (const tc of exploratoryToolCalls) {
    const stepContent = stepContentByCallId.get(tc.id);
    if (!stepContent) {
      throw new Error(
        `Step content not found for function call ${tc.id} (${tc.name})`
      );
    }

    const action = await createReinforcedAction(auth, {
      toolCall: tc,
      agentMessageModelId,
      stepContentId: stepContent.id,
      mcpServerViewId,
    });

    actionIds.push(action.id);
  }

  return {
    authType: auth.toJSON(),
    agentLoopArgs: {
      agentMessageId: agentMessageId,
      agentMessageVersion: 0,
      conversationId,
      conversationTitle: null,
      conversationBranchId: null,
      userMessageId: userMessageId,
      userMessageVersion: 0,
      initialStartTime: Date.now(),
    },
    actionIds,
    exploratoryToolCalls,
  };
}

/**
 * Store results for all terminal tool calls in the reinforcement conversation.
 * Creates AgentMCPActionResource records with output items so the rendering pipeline
 * picks them up as function results. This allows the LLM to see which calls succeeded
 * and which failed, so it can retry only the failed ones on the next iteration.
 */
export async function storeTerminalToolCallResults(
  auth: Authenticator,
  {
    successfulToolCalls,
    failedToolCalls,
    agentMessageModelId,
  }: {
    successfulToolCalls: TerminalToolCallSuccess[];
    failedToolCalls: TerminalToolCallFailure[];
    agentMessageModelId: ModelId;
  }
): Promise<void> {
  const [stepContentByCallId, mcpServerViewId] = await Promise.all([
    fetchStepContentByCallId(auth, agentMessageModelId),
    getAgentSidekickContextViewId(auth),
  ]);

  for (const { toolCall, message } of successfulToolCalls) {
    const stepContent = stepContentByCallId.get(toolCall.id);
    if (!stepContent) {
      continue;
    }

    const action = await createReinforcedAction(auth, {
      toolCall,
      agentMessageModelId,
      stepContentId: stepContent.id,
      mcpServerViewId,
    });

    await action.createOutputItems(auth, [
      { content: { type: "text", text: message } },
    ]);
    await action.markAsSucceeded({ executionDurationMs: 0 });
  }

  for (const { toolCall, errorMessage } of failedToolCalls) {
    const stepContent = stepContentByCallId.get(toolCall.id);
    if (!stepContent) {
      continue;
    }

    const action = await createReinforcedAction(auth, {
      toolCall,
      agentMessageModelId,
      stepContentId: stepContent.id,
      mcpServerViewId,
    });

    await action.createOutputItems(auth, [
      { content: { type: "text", text: errorMessage } },
    ]);
    // TODO(reinforced agent) Do not hardcode execution time to 0.
    await action.markAsErrored({ executionDurationMs: 0 });
  }
}
