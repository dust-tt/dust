import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  retryAgentMessage,
  softDeleteAgentMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { publishAgentMessagesEvents } from "@app/lib/api/assistant/streaming/events";
import { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
} from "@app/types";
import { ConversationError, isUserMessageType } from "@app/types";

// Mock the dependencies
vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
}));

describe("retryAgentMessage", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationType;
  let agentConfig: LightAgentConfigurationType;
  let agentMessage: AgentMessageType;

  beforeEach(async () => {
    // Setup test resources
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    // Create agent configuration
    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    // Create conversation with a user message and agent message
    const conversationWithoutContent = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    // Fetch the full conversation to get the content
    const fetchedConversationResult = await getConversation(
      auth,
      conversationWithoutContent.sId
    );
    if (fetchedConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    conversation = fetchedConversationResult.value;

    // Find the agent message in the conversation
    const agentMessages = conversation.content
      .flat()
      .filter((m) => m.type === "agent_message") as AgentMessageType[];
    if (agentMessages.length === 0) {
      throw new Error("No agent message found in conversation");
    }
    agentMessage = agentMessages[0];

    // Verify parentMessageId is set (factory should have set it up)
    if (!agentMessage.parentMessageId) {
      throw new Error("Agent message parentMessageId is not set");
    }

    // Clear mocks before each test
    vi.clearAllMocks();
  });

  it("should call launchAgentLoopWorkflow with correct arguments", async () => {
    const userMessage = conversation.content
      .flat()
      .filter(isUserMessageType)
      .find((m) => m.sId === agentMessage.parentMessageId);

    expect(userMessage).toBeDefined();

    const result = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });

    expect(result.isOk()).toBe(true);
    expect(launchAgentLoopWorkflow).toHaveBeenCalledTimes(1);

    if (result.isOk()) {
      const newAgentMessage = result.value;
      expect(launchAgentLoopWorkflow).toHaveBeenCalledWith({
        auth,
        agentLoopArgs: {
          agentMessageId: newAgentMessage.sId,
          agentMessageVersion: newAgentMessage.version,
          conversationId: conversation.sId,
          conversationTitle: conversation.title,
          userMessageId: userMessage!.sId,
          userMessageVersion: userMessage!.version,
          userMessageOrigin: userMessage!.context.origin,
        },
        startStep: 0,
      });
    }
  });

  it("should call publishAgentMessagesEvents with correct arguments", async () => {
    const result = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });

    expect(result.isOk()).toBe(true);
    expect(publishAgentMessagesEvents).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(publishAgentMessagesEvents).mock.calls[0];
    expect(callArgs[0].sId).toBe(conversation.sId);
    expect(callArgs[1]).toHaveLength(1);

    if (result.isOk()) {
      const newAgentMessage = result.value;
      expect(callArgs[1][0].sId).toBe(newAgentMessage.sId);
      expect(callArgs[1][0].type).toBe("agent_message");
      expect(callArgs[1][0].status).toBe("created");
      expect(callArgs[1][0].version).toBe(newAgentMessage.version);
      expect(callArgs[1][0].configuration.sId).toBe(
        agentMessage.configuration.sId
      );
    }
  });

  it("should create a new agent message version", async () => {
    const originalVersion = agentMessage.version;
    const originalRank = agentMessage.rank;
    const originalId = agentMessage.id;
    const originalSId = agentMessage.sId;

    const result = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const newAgentMessage = result.value;
      // Rank should stay the same
      expect(newAgentMessage.rank).toBe(originalRank);
      // Version should be increased
      expect(newAgentMessage.version).toBe(originalVersion + 1);
      // ID should be different (both database id and sId)
      expect(newAgentMessage.id).not.toBe(originalId);
      expect(newAgentMessage.sId).not.toBe(originalSId);
      // Status should be created
      expect(newAgentMessage.status).toBe("created");
      // Configuration should remain the same
      expect(newAgentMessage.configuration.sId).toBe(
        agentMessage.configuration.sId
      );
    }
  });

  it("should return error when message is not found", async () => {
    const nonExistentMessage: AgentMessageType = {
      ...agentMessage,
      id: 999999,
      sId: "non-existent-message-id",
    };

    const result = await retryAgentMessage(auth, {
      conversation,
      message: nonExistentMessage,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status_code).toBe(404);
      expect(result.error.api_error.type).toBe("message_not_found");
    }
    expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    expect(publishAgentMessagesEvents).not.toHaveBeenCalled();
  });

  it("should return error when message was already retried", async () => {
    // First retry
    const firstRetry = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });
    expect(firstRetry.isOk()).toBe(true);

    // Clear mocks
    vi.clearAllMocks();

    // Try to retry again with the same original message
    const secondRetry = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });

    expect(secondRetry.isErr()).toBe(true);
    if (secondRetry.isErr()) {
      expect(secondRetry.error.status_code).toBe(400);
      expect(secondRetry.error.api_error.type).toBe("invalid_request_error");
      expect(secondRetry.error.api_error.message).toContain("already retried");
    }
    expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    expect(publishAgentMessagesEvents).not.toHaveBeenCalled();
  });

  it("should preserve agent message properties in the retry", async () => {
    const result = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const newAgentMessage = result.value;
      expect(newAgentMessage.rank).toBe(agentMessage.rank);
      expect(newAgentMessage.parentMessageId).toBe(
        agentMessage.parentMessageId
      );
      expect(newAgentMessage.parentAgentMessageId).toBe(
        agentMessage.parentAgentMessageId
      );
      expect(newAgentMessage.configuration.sId).toBe(
        agentMessage.configuration.sId
      );
      expect(newAgentMessage.skipToolsValidation).toBe(
        agentMessage.skipToolsValidation
      );
    }
  });

  it("should clear hasError flag when conversation has error", async () => {
    // Set hasError flag on conversation directly in the database
    await ConversationModel.update(
      { hasError: true },
      {
        where: {
          id: conversation.id,
          workspaceId: workspace.id,
        },
      }
    );

    // Refresh conversation
    const refreshedConversationResult = await getConversation(
      auth,
      conversation.sId
    );
    if (refreshedConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    const refreshedConversation = refreshedConversationResult.value;
    expect(refreshedConversation.hasError).toBe(true);

    const result = await retryAgentMessage(auth, {
      conversation: refreshedConversation,
      message: agentMessage,
    });

    expect(result.isOk()).toBe(true);

    // Verify hasError was cleared
    const finalConversationResult = await getConversation(
      auth,
      conversation.sId
    );
    if (finalConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    const finalConversation = finalConversationResult.value;
    expect(finalConversation.hasError).toBe(false);
  });
});

describe("softDeleteAgentMessage", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationType;
  let agentConfig: LightAgentConfigurationType;
  let agentMessage: AgentMessageType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    // Create conversation with a user message and agent message
    const conversationWithoutContent = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    // Fetch the full conversation to get the content
    const fetchedConversationResult = await getConversation(
      auth,
      conversationWithoutContent.sId
    );
    if (fetchedConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    conversation = fetchedConversationResult.value;

    // Find the agent message in the conversation
    const agentMessages = conversation.content
      .flat()
      .filter((m) => m.type === "agent_message") as AgentMessageType[];
    if (agentMessages.length === 0) {
      throw new Error("No agent message found in conversation");
    }
    agentMessage = agentMessages[0];
  });

  it("allows the user who sent the parent message to soft delete the agent message", async () => {
    expect(agentMessage.visibility).toBe("visible");

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!conversationResource) {
      throw new Error("Failed to fetch conversation resource");
    }

    const result = await softDeleteAgentMessage(auth, {
      message: agentMessage,
      conversation: conversationResource.toJSON(),
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.success).toBe(true);
    }

    // Verify the message was deleted by fetching the conversation again
    const updatedConversationResult = await getConversation(
      auth,
      conversation.sId
    );
    if (updatedConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    const updatedConversation = updatedConversationResult.value;
    const updatedAgentMessages = updatedConversation.content
      .flat()
      .filter((m) => m.type === "agent_message") as AgentMessageType[];
    expect(updatedAgentMessages.length).toBe(2);
    expect(updatedAgentMessages[0].rank).toBe(1);
    expect(updatedAgentMessages[1].version).toBe(1);
    expect(updatedAgentMessages[1].visibility).toBe("deleted");
  });

  it("returns message_not_found when the message does not exist", async () => {
    const nonExistentMessage: AgentMessageType = {
      ...agentMessage,
      id: 999999,
      sId: "non-existent-message-id",
      parentMessageId: "non-existent-parent-message-id",
      visibility: "visible",
    };

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!conversationResource) {
      throw new Error("Failed to fetch conversation resource");
    }

    const result = await softDeleteAgentMessage(auth, {
      message: nonExistentMessage,
      conversation: conversationResource.toJSON(),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ConversationError);
      expect(result.error.type).toBe("message_not_found");
    }
  });

  it("returns message_deletion_not_authorized when a different user tries to delete the agent message", async () => {
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, {
      role: "user",
    });

    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    // Fetch the conversation with the other user's auth to get the message
    const fetchedConversationResult = await getConversation(
      otherAuth,
      conversation.sId
    );
    if (fetchedConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    const fetchedConversation = fetchedConversationResult.value;
    const agentMessages = fetchedConversation.content
      .flat()
      .filter(
        (m) => m.type === "agent_message" && m.sId === agentMessage.sId
      ) as AgentMessageType[];
    if (agentMessages.length === 0) {
      throw new Error("Agent message not found in conversation");
    }
    const messageToDelete = agentMessages[0];

    const fetchedConversationResource = await ConversationResource.fetchById(
      otherAuth,
      fetchedConversation.sId
    );
    if (!fetchedConversationResource) {
      throw new Error("Failed to fetch conversation resource");
    }

    const result = await softDeleteAgentMessage(otherAuth, {
      message: messageToDelete,
      conversation: fetchedConversationResource.toJSON(),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ConversationError);
      expect(result.error.type).toBe("message_deletion_not_authorized");
    }
  });
});
