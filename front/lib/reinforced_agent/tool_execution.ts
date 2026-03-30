import { AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import type { ExploratoryToolCallInfo } from "@app/lib/reinforced_agent/types";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
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
 * Create AgentMCPActionResource records for each exploratory tool call.
 * Returns the info needed by the workflow to call runRetryableToolActivity.
 */
export async function prepareReinforcedToolActions(
  auth: Authenticator,
  {
    exploratoryToolCalls,
    agentMessageModelId,
    agentMessageSId,
    userMessageSId,
    conversationId,
  }: {
    exploratoryToolCalls: ExploratoryToolCallInfo[];
    agentMessageModelId: ModelId;
    agentMessageSId: string;
    userMessageSId: string;
    conversationId: string;
  }
): Promise<ReinforcedToolActionInfo> {
  // Find step content for each function call.
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

  const stepContentByCallId = new Map(
    functionCallStepContents.map((s) => [s.value.value.id, s])
  );

  // Create AgentMCPActionResource for each exploratory tool call.
  const actionIds: ModelId[] = [];
  for (const tc of exploratoryToolCalls) {
    const stepContent = stepContentByCallId.get(tc.id);
    if (!stepContent) {
      throw new Error(
        `Step content not found for function call ${tc.id} (${tc.name})`
      );
    }

    const meta = AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA[tc.name];

    const action = await AgentMCPActionResource.makeNew(auth, {
      agentMessageId: agentMessageModelId,
      augmentedInputs: tc.arguments,
      citationsAllocated: 0,
      mcpServerConfigurationId: "agent_sidekick_context",
      status: "ready_allowed_explicitly",
      stepContentId: stepContent.id,
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
        name: tc.name,
        originalName: tc.name,
        mcpServerName: "agent_sidekick_context",
        dataSources: null,
        tables: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        mcpServerViewId: "",
        dustAppConfiguration: null,
        internalMCPServerId: "agent_sidekick_context",
        secretName: null,
        dustProject: null,
        availability: "auto",
        permission: meta.stake,
        toolServerId: "agent_sidekick_context",
        retryPolicy: "no_retry",
      },
      version: 0,
    });

    actionIds.push(action.id);
  }

  return {
    authType: auth.toJSON(),
    agentLoopArgs: {
      agentMessageId: agentMessageSId,
      agentMessageVersion: 0,
      conversationId,
      conversationTitle: null,
      conversationBranchId: null,
      userMessageId: userMessageSId,
      userMessageVersion: 0,
      initialStartTime: Date.now(),
    },
    actionIds,
    exploratoryToolCalls,
  };
}
