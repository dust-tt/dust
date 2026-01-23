import type { AgentLoopContextType } from "@app/lib/actions/types";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types";
import type { AgentMessageType, ConversationType } from "@app/types";

/**
 * Factory for creating AgentLoopContext instances for testing MCP servers.
 * Provides helpers to set up the full context needed for agent loop execution.
 */
export class AgentLoopContextFactory {
  /**
   * Creates a complete AgentLoopContext with runContext.
   * This includes creating an agent, a conversation with messages,
   * and building the full context structure.
   *
   * @param auth - Authenticator for the test user
   * @param overrides - Optional overrides for agent and conversation configuration
   * @returns Complete AgentLoopContextType ready for use in tests
   *
   * @example
   * const auth = setup.authenticator;
   * const context = await AgentLoopContextFactory.createRunContext(auth, {
   *   agentConfig: { name: "Test Agent" },
   * });
   */
  static async createRunContext(
    auth: Authenticator,
    overrides?: {
      agentConfig?: Parameters<
        typeof AgentConfigurationFactory.createTestAgent
      >[1];
      conversationId?: string;
    }
  ): Promise<AgentLoopContextType> {
    const workspace = auth.getNonNullableWorkspace();

    // Create agent configuration
    const lightAgentConfig = await AgentConfigurationFactory.createTestAgent(
      auth,
      overrides?.agentConfig
    );

    // Create full agent configuration (add actions array)
    const agentConfiguration: AgentConfigurationType = {
      ...lightAgentConfig,
      actions: [],
    };

    // Create conversation with messages
    const conversationWithoutContent = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });

    // Fetch conversation resource
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversationWithoutContent.sId
    );
    if (!conversationResource) {
      throw new Error("Failed to fetch conversation resource");
    }

    // Fetch all messages from the conversation with associations
    const allMessages = await MessageModel.findAll({
      where: {
        conversationId: conversationWithoutContent.id,
        workspaceId: workspace.id,
      },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          required: false,
        },
        {
          model: AgentMessageModel,
          as: "agentMessage",
          required: false,
        },
      ],
      order: [["rank", "ASC"]],
    });

    // Render messages to get full typed messages
    const renderedMessagesResult = await batchRenderMessages(
      auth,
      conversationResource,
      allMessages,
      "full"
    );

    if (renderedMessagesResult.isErr()) {
      throw new Error(
        `Failed to render messages: ${renderedMessagesResult.error.message}`
      );
    }

    const renderedMessages = renderedMessagesResult.value;

    // Find the agent message
    const agentMessage = renderedMessages.find(
      (m) => m.type === "agent_message"
    ) as AgentMessageType | undefined;

    if (!agentMessage) {
      throw new Error("No agent message found in conversation");
    }

    // Build full conversation with content
    const conversation: ConversationType = {
      ...conversationWithoutContent,
      content: [renderedMessages],
    };

    // Create tool configuration (minimal for testing)
    const toolConfiguration = {
      sId: "test-tool-config",
      name: "test_tool",
      description: "Test tool",
      type: "server_side_mcp_server" as const,
      internalMCPServerName: "skill_management" as const,
      additionalConfiguration: {},
      mcpServerId: "test-mcp-server-id",
    };

    // Build AgentLoopContextType
    return {
      runContext: {
        agentConfiguration,
        agentMessage,
        conversation,
        stepContext: {
          citationsCount: 0,
          citationsOffset: 0,
          resumeState: null,
          retrievalTopK: 10,
          websearchResultCount: 5,
        },
        toolConfiguration,
      },
    };
  }

  /**
   * Creates a minimal AgentLoopContext for simple testing scenarios.
   * This is a lighter version that skips full message rendering.
   *
   * @param auth - Authenticator for the test user
   * @param agentConfig - Optional agent configuration overrides
   * @returns Minimal AgentLoopContextType suitable for basic tests
   *
   * @example
   * const auth = setup.authenticator;
   * const context = await AgentLoopContextFactory.createMinimalContext(auth);
   */
  static async createMinimalContext(
    auth: Authenticator,
    agentConfig?: LightAgentConfigurationType
  ): Promise<AgentLoopContextType> {
    // Use provided agent or create a new one
    const lightAgentConfig =
      agentConfig ?? (await AgentConfigurationFactory.createTestAgent(auth));

    // Create full agent configuration
    const agentConfiguration: AgentConfigurationType = {
      ...lightAgentConfig,
      actions: [],
    };

    // Create conversation with messages
    const conversationWithoutContent = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });

    // Create minimal agent message type
    const agentMessage: AgentMessageType = {
      id: 1,
      agentMessageId: 1,
      created: Date.now(),
      completedTs: null,
      sId: "test-agent-message",
      type: "agent_message",
      visibility: "visible",
      version: 0,
      parentMessageId: "",
      parentAgentMessageId: null,
      status: "created",
      content: null,
      chainOfThought: null,
      error: null,
      configuration: agentConfiguration,
      skipToolsValidation: false,
      actions: [],
      rawContents: [],
      contents: [],
      parsedContents: {},
      reactions: [],
      modelInteractionDurationMs: null,
      completionDurationMs: null,
      rank: 1,
    };

    // Build minimal conversation
    const conversation: ConversationType = {
      ...conversationWithoutContent,
      content: [[agentMessage]],
    };

    // Create tool configuration
    const toolConfiguration = {
      sId: "test-tool-config",
      name: "test_tool",
      description: "Test tool",
      type: "server_side_mcp_server" as const,
      internalMCPServerName: "skill_management" as const,
      additionalConfiguration: {},
      mcpServerId: "test-mcp-server-id",
    };

    return {
      runContext: {
        agentConfiguration,
        agentMessage,
        conversation,
        stepContext: {
          citationsCount: 0,
          citationsOffset: 0,
          resumeState: null,
          retrievalTopK: 10,
          websearchResultCount: 5,
        },
        toolConfiguration,
      },
    };
  }
}
