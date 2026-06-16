import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import type { MessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import type {
  AgentMessageType,
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";

export class AgentMCPActionFactory {
  // Monotonic counter: step content indexes only need to be unique within an agent message.
  private static stepContentIndex = 0;

  /**
   * Creates an MCP action (with its function_call step content and tool execution row),
   * blocked on tool validation by default.
   */
  static async create(
    auth: Authenticator,
    {
      workspace,
      conversationModelId,
      agentMessageModelId,
      status = "blocked_validation_required",
    }: {
      workspace: WorkspaceType;
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      status?: ToolExecutionStatus;
    }
  ): Promise<{
    action: AgentMCPActionResource;
  }> {
    const functionCallId = generateRandomModelSId();
    const currentIndex = this.stepContentIndex++;

    const stepContent = await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId: agentMessageModelId,
      step: 1,
      index: currentIndex,
      version: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: functionCallId,
          name: "test_tool",
          arguments: "{}",
        },
      },
    });

    const toolConfiguration: LightMCPToolConfigurationType = {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "test_tool",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: "test-server-view",
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: null,
      availability: "auto",
      permission: "low",
      toolServerId: "test-server",
      retryPolicy: "no_retry",
      originalName: "test_tool",
      mcpServerName: "test_server",
    };

    const action = await AgentMCPActionModel.create({
      workspaceId: workspace.id,
      agentMessageId: agentMessageModelId,
      mcpServerConfigurationId: generateRandomModelSId(),
      status,
      citationsAllocated: 0,
      augmentedInputs: {},
      toolConfiguration,
      stepContentId: stepContent.id,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        resumeState: null,
        retrievalTopK: 10,
        websearchResultCount: 5,
      },
    });

    await AgentStepContentToolExecutionModel.create({
      workspaceId: workspace.id,
      conversationId: conversationModelId,
      agentMessageId: agentMessageModelId,
      agentMCPActionId: action.id,
      stepContentId: stepContent.id,
    });

    const actionResource = await AgentMCPActionResource.fetchById(
      auth,
      AgentMCPActionResource.modelIdToSId({
        id: action.id,
        workspaceId: workspace.id,
      })
    );
    if (!actionResource) {
      throw new Error("Just-created MCP action not found.");
    }

    return { action: actionResource };
  }

  /**
   * Creates an agent message (with a fresh test agent configuration) holding a single MCP
   * action, blocked on tool validation by default.
   */
  static async createWithAgentMessage(
    auth: Authenticator,
    {
      workspace,
      conversation,
      status = "blocked_validation_required",
    }: {
      workspace: WorkspaceType;
      conversation: ConversationType | ConversationWithoutContentType;
      status?: ToolExecutionStatus;
    }
  ): Promise<{
    messageRow: MessageModel;
    agentMessage: AgentMessageType;
    action: AgentMCPActionResource;
  }> {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    const { messageRow, agentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation,
        agentConfig,
      });

    const { action } = await this.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status,
    });

    return { messageRow, agentMessage, action };
  }
}
