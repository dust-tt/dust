import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { SandboxChildActionInfo } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
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
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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
      step = 1,
      dustRunId = null,
      output = [],
      inputs = {},
      functionCallName = "test_tool",
      toolName = "test_tool",
      mcpServerName = "test_server",
      toolServerId = "test-server",
      childAgentId = null,
      sandboxChildActionInfo,
      parentAction,
    }: {
      workspace: WorkspaceType;
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      status?: ToolExecutionStatus;
      step?: number;
      dustRunId?: string | null;
      output?: CallToolResult["content"];
      inputs?: Record<string, unknown>;
      functionCallName?: string;
      toolName?: string;
      mcpServerName?: string;
      toolServerId?: string;
      childAgentId?: string | null;
      sandboxChildActionInfo?: SandboxChildActionInfo;
      parentAction?: AgentMCPActionResource;
    }
  ): Promise<{
    action: AgentMCPActionResource;
  }> {
    const functionCallId = generateRandomModelSId();
    const currentIndex = this.stepContentIndex++;

    const stepContent =
      parentAction?.stepContent ??
      (await AgentStepContentModel.create({
        workspaceId: workspace.id,
        agentMessageId: agentMessageModelId,
        step,
        index: currentIndex,
        version: 0,
        dustRunId,
        type: "function_call",
        value: {
          type: "function_call",
          value: {
            id: functionCallId,
            name: functionCallName,
            arguments: "{}",
          },
        },
      }));

    const toolConfiguration: LightMCPToolConfigurationType = {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: functionCallName,
      dataSources: null,
      tables: null,
      childAgentId,
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
      toolServerId,
      retryPolicy: "no_retry",
      originalName: toolName,
      mcpServerName,
    };

    // TODO(Adrien): Drop column if not used anymore.
    // The action's stepContentId column is left null on purpose, mirroring production: the action is
    // tied to its step content through the tool execution row below, not through this column. Setting
    // it here would hide code paths that resolve the step content the real way.
    const action = await AgentMCPActionModel.create({
      workspaceId: workspace.id,
      agentMessageId: agentMessageModelId,
      mcpServerConfigurationId: generateRandomModelSId(),
      status,
      citationsAllocated: 0,
      augmentedInputs: inputs,
      toolConfiguration,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        resumeState: null,
        retrievalTopK: 10,
        websearchResultCount: 5,
        ...(sandboxChildActionInfo ? { sandboxChildActionInfo } : {}),
      },
    });

    await AgentStepContentToolExecutionModel.create({
      workspaceId: workspace.id,
      conversationId: conversationModelId,
      agentMessageId: agentMessageModelId,
      agentMCPActionId: action.id,
      stepContentId: stepContent.id,
    });

    if (output.length > 0) {
      await AgentMCPActionOutputItemModel.bulkCreate(
        output.map((content) => ({
          workspaceId: workspace.id,
          agentMCPActionId: action.id,
          content,
          contentGcsPath: null,
          citations: null,
        }))
      );
    }

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
   * Transitions an existing action to a new status, as happens once a blocked tool is approved
   * (or denied) and then settles. The action resource passed in is not mutated, so callers that
   * need the new status should re-fetch.
   */
  static async setStatus(
    auth: Authenticator,
    {
      action,
      status,
    }: {
      action: AgentMCPActionResource;
      status: ToolExecutionStatus;
    }
  ): Promise<void> {
    await AgentMCPActionModel.update(
      { status },
      {
        where: {
          id: action.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );
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
