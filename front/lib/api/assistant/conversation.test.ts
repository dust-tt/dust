import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  editUserMessage,
  postNewContentFragment,
  postUserMessage,
  retryAgentMessage,
  softDeleteAgentMessage,
} from "@app/lib/api/assistant/conversation";
import { getContentFragmentBlob } from "@app/lib/api/assistant/conversation/content_fragment";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { publishAgentMessagesEvents } from "@app/lib/api/assistant/streaming/events";
import { Authenticator } from "@app/lib/auth";
import { MentionModel } from "@app/lib/models/agent/conversation";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  AgentMention,
  AgentMessageType,
  ContentFragmentInputWithContentNode,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  UserMessageType,
} from "@app/types";
import {
  ConversationError,
  isContentFragmentInputWithContentNode,
  isRichAgentMention,
  isRichUserMention,
  isUserMessageType,
  Ok,
} from "@app/types";

// Mock the dependencies
vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/conversation/content_fragment", () => ({
  getContentFragmentBlob: vi.fn(),
}));

// Mock rateLimiter from the utils module
import * as rateLimiterModule from "@app/lib/utils/rate_limiter";

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

  it("should return error when message limit is reached", async () => {
    // Mock rateLimiter to return 0 (no remaining messages)
    const rateLimiterSpy = vi
      .spyOn(rateLimiterModule, "rateLimiter")
      .mockResolvedValue(0);

    const result = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status_code).toBe(403);
      expect(result.error.api_error.type).toBe("rate_limit_error");
    }
    expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    expect(publishAgentMessagesEvents).not.toHaveBeenCalled();

    // Restore the mock for other tests
    rateLimiterSpy.mockRestore();
  });

  it("should succeed when under the message limit", async () => {
    // Mock rateLimiter to return positive value (messages remaining)
    const rateLimiterSpy = vi
      .spyOn(rateLimiterModule, "rateLimiter")
      .mockResolvedValue(100);

    const result = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });

    expect(result.isOk()).toBe(true);
    expect(launchAgentLoopWorkflow).toHaveBeenCalledTimes(1);

    // Restore the mock for other tests
    rateLimiterSpy.mockRestore();
  });

  it("should return error when parent user message is not found", async () => {
    // Create a message with an invalid parentMessageId
    const messageWithInvalidParent: AgentMessageType = {
      ...agentMessage,
      parentMessageId: "non-existent-parent-id",
    };

    const result = await retryAgentMessage(auth, {
      conversation,
      message: messageWithInvalidParent,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status_code).toBe(400);
      expect(result.error.api_error.type).toBe("invalid_request_error");
      expect(result.error.api_error.message).toContain("parent user message");
    }
    expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    expect(publishAgentMessagesEvents).not.toHaveBeenCalled();
  });

  it("should use the parent user message context for rate limiting", async () => {
    // Find the parent user message to get its context
    const parentUserMessage = conversation.content
      .flat()
      .filter(isUserMessageType)
      .find((m) => m.sId === agentMessage.parentMessageId);

    expect(parentUserMessage).toBeDefined();
    expect(parentUserMessage!.context).toBeDefined();

    // Spy on rateLimiter to capture the calls
    const rateLimiterSpy = vi
      .spyOn(rateLimiterModule, "rateLimiter")
      .mockResolvedValue(100);

    const result = await retryAgentMessage(auth, {
      conversation,
      message: agentMessage,
    });

    expect(result.isOk()).toBe(true);

    // Verify rateLimiter was called (it's called multiple times for different checks)
    expect(rateLimiterSpy).toHaveBeenCalled();

    // The rate limiter should have been called with keys that include the workspace
    // This verifies the context is being used for rate limiting
    const calls = rateLimiterSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    // Verify the parent user message's origin is preserved in the workflow call
    expect(launchAgentLoopWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        agentLoopArgs: expect.objectContaining({
          userMessageOrigin: parentUserMessage!.context.origin,
        }),
      })
    );

    rateLimiterSpy.mockRestore();
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

describe("postUserMessage", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationType;
  let agentConfig1: LightAgentConfigurationType;
  let agentConfig2: LightAgentConfigurationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    agentConfig1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 1",
      description: "First test agent",
    });

    agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 2",
      description: "Second test agent",
    });

    const conversationWithoutContent = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig1.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const fetchedConversationResult = await getConversation(
      auth,
      conversationWithoutContent.sId
    );
    if (fetchedConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    conversation = fetchedConversationResult.value;

    vi.clearAllMocks();
  });

  it("should preserve agent mentions in the returned userMessage", async () => {
    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } satisfies AgentMention,
      {
        configurationId: agentConfig2.sId,
      } satisfies AgentMention,
    ];

    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const result = await postUserMessage(auth, {
      conversation,
      content: `Hello @${agentConfig1.name} and @${agentConfig2.name}`,
      mentions,
      context: {
        username: userJson.username,
        timezone: "UTC",
        fullName: userJson.fullName,
        email: userJson.email,
        profilePictureUrl: userJson.image,
        origin: "web",
      },
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has mentions
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(2);

      // Verify userMessage has richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(2);

      // Verify all mentions are agent mentions
      const agentMentions = userMessage.richMentions.filter(isRichAgentMention);
      expect(agentMentions.length).toBe(2);

      // Verify the agent configurations match
      const mentionedAgentIds = agentMentions.map((m) => m.id);
      expect(mentionedAgentIds).toContain(agentConfig1.sId);
      expect(mentionedAgentIds).toContain(agentConfig2.sId);

      // Verify mentions are stored in the database
      const mentionsInDb = await MentionModel.findAll({
        where: {
          messageId: userMessage.id,
          workspaceId: workspace.id,
        },
      });
      expect(mentionsInDb.length).toBe(2);
      const agentConfigIdsInDb = mentionsInDb
        .map((m) => m.agentConfigurationId)
        .filter((id): id is string => id !== null);
      expect(agentConfigIdsInDb).toContain(agentConfig1.sId);
      expect(agentConfigIdsInDb).toContain(agentConfig2.sId);

      // Verify launchAgentLoopWorkflow was called for agent mentions
      expect(launchAgentLoopWorkflow).toHaveBeenCalled();
    }
  });

  it("should preserve user mentions in the returned userMessage", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
    ];

    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const result = await postUserMessage(auth, {
      conversation,
      content: `Hello @${mentionedUser.username}`,
      mentions,
      context: {
        username: userJson.username,
        timezone: "UTC",
        fullName: userJson.fullName,
        email: userJson.email,
        profilePictureUrl: userJson.image,
        origin: "web",
      },
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has mentions
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(1);

      // Verify userMessage has richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(1);

      // Verify it's a user mention
      const userMention = userMessage.richMentions[0];
      expect(isRichUserMention(userMention)).toBe(true);
      if (isRichUserMention(userMention)) {
        expect(userMention.id).toBe(mentionedUser.sId);
      }

      // Verify mention is stored in the database
      const mentionInDb = await MentionModel.findOne({
        where: {
          messageId: userMessage.id,
          userId: mentionedUser.id,
          workspaceId: workspace.id,
        },
      });
      expect(mentionInDb).not.toBeNull();

      // Verify launchAgentLoopWorkflow was NOT called (no agent mentions)
      expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    }
  });

  it("should preserve both user and agent mentions in the returned userMessage", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
      {
        configurationId: agentConfig1.sId,
      } satisfies AgentMention,
    ];

    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const result = await postUserMessage(auth, {
      conversation,
      content: `Hello @${mentionedUser.username} and @${agentConfig1.name}`,
      mentions,
      context: {
        username: userJson.username,
        timezone: "UTC",
        fullName: userJson.fullName,
        email: userJson.email,
        profilePictureUrl: userJson.image,
        origin: "web",
      },
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has mentions
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(2);

      // Verify userMessage has richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(2);

      // Verify we have both user and agent mentions
      const userMentions = userMessage.richMentions.filter(isRichUserMention);
      const agentMentions = userMessage.richMentions.filter(isRichAgentMention);
      expect(userMentions.length).toBe(1);
      expect(agentMentions.length).toBe(1);

      // Verify the user mention
      expect(userMentions[0].id).toBe(mentionedUser.sId);

      // Verify the agent mention
      expect(agentMentions[0].id).toBe(agentConfig1.sId);

      // Verify mentions are stored in the database
      const mentionsInDb = await MentionModel.findAll({
        where: {
          messageId: userMessage.id,
          workspaceId: workspace.id,
        },
      });
      expect(mentionsInDb.length).toBe(2);

      // Verify launchAgentLoopWorkflow was called for agent mentions
      expect(launchAgentLoopWorkflow).toHaveBeenCalled();
    }
  });

  it("should preserve empty mentions array when no mentions are provided", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const result = await postUserMessage(auth, {
      conversation,
      content: "Hello without mentions",
      mentions: [],
      context: {
        username: userJson.username,
        timezone: "UTC",
        fullName: userJson.fullName,
        email: userJson.email,
        profilePictureUrl: userJson.image,
        origin: "web",
      },
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has empty mentions
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(0);

      // Verify userMessage has empty richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(0);

      // Verify launchAgentLoopWorkflow was NOT called (no agent mentions)
      expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    }
  });

  describe("project conversation member constraint", () => {
    let projectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;
    let nonMemberAuth: Authenticator;
    let memberAuth: Authenticator;
    let projectConversation: ConversationType;

    beforeEach(async () => {
      // Create a project space
      projectSpace = await SpaceFactory.project(workspace);

      // Create a non-member user
      const nonMemberUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, nonMemberUser, {
        role: "user",
      });
      nonMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        nonMemberUser.sId,
        workspace.sId
      );

      // Create a member user (the auth user from the parent describe block)
      const memberUser = auth.getNonNullableUser();
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add member user to the project space group
      const projectSpaceGroup = projectSpace.groups.find(
        (g) => g.kind === "regular"
      );
      if (projectSpaceGroup) {
        const addRes = await projectSpaceGroup.addMember(internalAdminAuth, {
          user: memberUser.toJSON(),
        });
        if (addRes.isErr()) {
          throw new Error(
            `Failed to add user to project space group: ${addRes.error.message}`
          );
        }
      }

      // Refresh auth to get updated groups
      await auth.refresh();
      memberAuth = auth;

      // Create a conversation in the project space
      const conversationWithoutContent = await ConversationFactory.create(
        memberAuth,
        {
          agentConfigurationId: agentConfig1.sId,
          messagesCreatedAt: [],
          spaceId: projectSpace.id,
        }
      );

      const fetchedConversationResult = await getConversation(
        memberAuth,
        conversationWithoutContent.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      projectConversation = fetchedConversationResult.value;
    });

    it("should allow posting a message when user is a project member", async () => {
      const user = memberAuth.getNonNullableUser();
      const userJson = user.toJSON();

      const result = await postUserMessage(memberAuth, {
        conversation: projectConversation,
        content: "Hello from a project member",
        mentions: [],
        context: {
          username: userJson.username,
          timezone: "UTC",
          fullName: userJson.fullName,
          email: userJson.email,
          profilePictureUrl: userJson.image,
          origin: "web",
        },
        skipToolsValidation: false,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.userMessage.content).toBe(
          "Hello from a project member"
        );
      }
    });

    it("should reject posting a message when user is not a project member", async () => {
      const user = nonMemberAuth.getNonNullableUser();
      const userJson = user.toJSON();

      const result = await postUserMessage(nonMemberAuth, {
        conversation: projectConversation,
        content: "Hello from a non-member",
        mentions: [],
        context: {
          username: userJson.username,
          timezone: "UTC",
          fullName: userJson.fullName,
          email: userJson.email,
          profilePictureUrl: userJson.image,
          origin: "web",
        },
        skipToolsValidation: false,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.status_code).toBe(403);
        expect(result.error.api_error.type).toBe("workspace_auth_error");
        expect(result.error.api_error.message).toBe(
          "You are not a member of the project."
        );
      }
    });

    it("should return 404 when project space does not exist", async () => {
      const user = memberAuth.getNonNullableUser();
      const userJson = user.toJSON();

      // Create a conversation with a non-existent spaceId
      const conversationWithInvalidSpace: ConversationType = {
        ...projectConversation,
        spaceId: "invalid-space-id",
      };

      const result = await postUserMessage(memberAuth, {
        conversation: conversationWithInvalidSpace,
        content: "Hello",
        mentions: [],
        context: {
          username: userJson.username,
          timezone: "UTC",
          fullName: userJson.fullName,
          email: userJson.email,
          profilePictureUrl: userJson.image,
          origin: "web",
        },
        skipToolsValidation: false,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.status_code).toBe(404);
        expect(result.error.api_error.type).toBe("space_not_found");
        expect(result.error.api_error.message).toBe("Space not found");
      }
    });

    it("should allow posting to non-project conversations without member check", async () => {
      // Create a regular (non-project) conversation
      const regularConversationWithoutContent =
        await ConversationFactory.create(memberAuth, {
          agentConfigurationId: agentConfig1.sId,
          messagesCreatedAt: [],
          // No spaceId means it's not a project conversation
        });

      const fetchedConversationResult = await getConversation(
        memberAuth,
        regularConversationWithoutContent.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      const regularConversation = fetchedConversationResult.value;

      // Non-member should be able to post to non-project conversations
      const user = nonMemberAuth.getNonNullableUser();
      const userJson = user.toJSON();

      const result = await postUserMessage(nonMemberAuth, {
        conversation: regularConversation,
        content: "Hello from a non-member to regular conversation",
        mentions: [],
        context: {
          username: userJson.username,
          timezone: "UTC",
          fullName: userJson.fullName,
          email: userJson.email,
          profilePictureUrl: userJson.image,
          origin: "web",
        },
        skipToolsValidation: false,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.userMessage.content).toBe(
          "Hello from a non-member to regular conversation"
        );
      }
    });
  });
});

describe("editUserMessage", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationType;
  let agentConfig1: LightAgentConfigurationType;
  let agentConfig2: LightAgentConfigurationType;
  let originalUserMessage: UserMessageType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    agentConfig1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 1",
      description: "First test agent",
    });

    agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 2",
      description: "Second test agent",
    });

    const conversationWithoutContent = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig1.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    const fetchedConversationResult = await getConversation(
      auth,
      conversationWithoutContent.sId
    );
    if (fetchedConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    conversation = fetchedConversationResult.value;

    // Create an original user message with agent mentions
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const postResult = await postUserMessage(auth, {
      conversation,
      content: `Original message with @${agentConfig1.name}`,
      mentions: [
        {
          configurationId: agentConfig1.sId,
        } satisfies AgentMention,
      ],
      context: {
        username: userJson.username,
        timezone: "UTC",
        fullName: userJson.fullName,
        email: userJson.email,
        profilePictureUrl: userJson.image,
        origin: "web",
      },
      skipToolsValidation: false,
    });

    if (postResult.isErr()) {
      throw new Error("Failed to create original message");
    }
    originalUserMessage = postResult.value.userMessage;

    vi.clearAllMocks();
  });

  it("should preserve agent mentions when editing a user message", async () => {
    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } satisfies AgentMention,
      {
        configurationId: agentConfig2.sId,
      } satisfies AgentMention,
    ];

    const result = await editUserMessage(auth, {
      conversation,
      message: originalUserMessage,
      content: `Edited message with @${agentConfig1.name} and @${agentConfig2.name}`,
      mentions,
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has mentions
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(2);

      // Verify userMessage has richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(2);

      // Verify all mentions are agent mentions
      const agentMentions = userMessage.richMentions.filter(isRichAgentMention);
      expect(agentMentions.length).toBe(2);

      // Verify the agent configurations match
      const mentionedAgentIds = agentMentions.map((m) => m.id);
      expect(mentionedAgentIds).toContain(agentConfig1.sId);
      expect(mentionedAgentIds).toContain(agentConfig2.sId);

      // Verify mentions are stored in the database for the edited message
      const mentionsInDb = await MentionModel.findAll({
        where: {
          messageId: userMessage.id,
          workspaceId: workspace.id,
        },
      });
      expect(mentionsInDb.length).toBe(2);
      const agentConfigIdsInDb = mentionsInDb
        .map((m) => m.agentConfigurationId)
        .filter((id): id is string => id !== null);
      expect(agentConfigIdsInDb).toContain(agentConfig1.sId);
      expect(agentConfigIdsInDb).toContain(agentConfig2.sId);

      // Verify launchAgentLoopWorkflow was called for agent mentions
      expect(launchAgentLoopWorkflow).toHaveBeenCalled();
    }
  });

  it("should preserve user mentions when editing a user message", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
    ];

    const result = await editUserMessage(auth, {
      conversation,
      message: originalUserMessage,
      content: `Edited message with @${mentionedUser.username}`,
      mentions,
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has mentions
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(1);

      // Verify userMessage has richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(1);

      // Verify it's a user mention
      const userMention = userMessage.richMentions[0];
      expect(isRichUserMention(userMention)).toBe(true);
      if (isRichUserMention(userMention)) {
        expect(userMention.id).toBe(mentionedUser.sId);
      }

      // Verify mention is stored in the database
      const mentionInDb = await MentionModel.findOne({
        where: {
          messageId: userMessage.id,
          userId: mentionedUser.id,
          workspaceId: workspace.id,
        },
      });
      expect(mentionInDb).not.toBeNull();

      // Verify launchAgentLoopWorkflow was NOT called (no agent mentions)
      expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    }
  });

  it("should preserve both user and agent mentions when editing a user message", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
      {
        configurationId: agentConfig2.sId,
      } satisfies AgentMention,
    ];

    const result = await editUserMessage(auth, {
      conversation,
      message: originalUserMessage,
      content: `Edited message with @${mentionedUser.username} and @${agentConfig2.name}`,
      mentions,
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has mentions
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(2);

      // Verify userMessage has richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(2);

      // Verify we have both user and agent mentions
      const userMentions = userMessage.richMentions.filter(isRichUserMention);
      const agentMentions = userMessage.richMentions.filter(isRichAgentMention);
      expect(userMentions.length).toBe(1);
      expect(agentMentions.length).toBe(1);

      // Verify the user mention
      expect(userMentions[0].id).toBe(mentionedUser.sId);

      // Verify the agent mention
      expect(agentMentions[0].id).toBe(agentConfig2.sId);

      // Verify mentions are stored in the database
      const mentionsInDb = await MentionModel.findAll({
        where: {
          messageId: userMessage.id,
          workspaceId: workspace.id,
        },
      });
      expect(mentionsInDb.length).toBe(2);

      // Verify launchAgentLoopWorkflow was called for agent mentions
      expect(launchAgentLoopWorkflow).toHaveBeenCalled();
    }
  });

  it("should preserve empty mentions array when editing removes all mentions", async () => {
    const result = await editUserMessage(auth, {
      conversation,
      message: originalUserMessage,
      content: "Edited message without mentions",
      mentions: [],
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has empty mentions
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(0);

      // Verify userMessage has empty richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(0);

      // Verify no mentions are stored in the database for the edited message
      const mentionsInDb = await MentionModel.findAll({
        where: {
          messageId: userMessage.id,
          workspaceId: workspace.id,
        },
      });
      expect(mentionsInDb.length).toBe(0);

      // Verify launchAgentLoopWorkflow was NOT called (no agent mentions)
      expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    }
  });

  it("should preserve mentions when editing a message without agent mentions (only user mentions)", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
    ];

    const result = await editUserMessage(auth, {
      conversation,
      message: originalUserMessage,
      content: `Edited message with only user mention @${mentionedUser.username}`,
      mentions,
      skipToolsValidation: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const { userMessage } = result.value;

      // Verify userMessage has mentions (this is the critical test - ensuring mentions aren't lost)
      expect(userMessage).not.toBeNull();
      expect(userMessage.mentions).toBeDefined();
      expect(userMessage.mentions.length).toBe(1);

      // Verify userMessage has richMentions
      expect(userMessage.richMentions).toBeDefined();
      expect(userMessage.richMentions.length).toBe(1);

      // Verify it's a user mention
      const userMention = userMessage.richMentions[0];
      expect(isRichUserMention(userMention)).toBe(true);
      if (isRichUserMention(userMention)) {
        expect(userMention.id).toBe(mentionedUser.sId);
      }

      // Verify launchAgentLoopWorkflow was NOT called (no agent mentions)
      expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    }
  });
});

describe("postNewContentFragment", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationType;
  let agentConfig: LightAgentConfigurationType;
  let globalSpace: Awaited<
    ReturnType<typeof createResourceTest>
  >["globalSpace"];
  let projectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;
  let anotherProjectSpace: Awaited<ReturnType<typeof SpaceFactory.project>>;
  let dsViewInProjectSpace: Awaited<
    ReturnType<typeof DataSourceViewFactory.folder>
  >;
  let dsViewInGlobalSpace: Awaited<
    ReturnType<typeof DataSourceViewFactory.folder>
  >;
  let dsViewInAnotherProjectSpace: Awaited<
    ReturnType<typeof DataSourceViewFactory.folder>
  >;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
    globalSpace = setup.globalSpace;

    // Create agent configuration
    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    // Create project spaces
    projectSpace = await SpaceFactory.project(workspace);
    anotherProjectSpace = await SpaceFactory.project(workspace);

    // Add user to the groups associated with the project spaces so they can access them
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    // SpaceFactory.project creates a group and associates it with the space
    // We need to add the user to those groups
    // The groups are available on space.groups
    const projectSpaceGroup = projectSpace.groups.find(
      (g) => g.kind === "regular"
    );
    const anotherProjectSpaceGroup = anotherProjectSpace.groups.find(
      (g) => g.kind === "regular"
    );

    if (projectSpaceGroup) {
      const addRes = await projectSpaceGroup.addMember(internalAdminAuth, {
        user: userJson,
      });
      if (addRes.isErr()) {
        throw new Error(
          `Failed to add user to project space group: ${addRes.error.message}`
        );
      }
    }

    if (anotherProjectSpaceGroup) {
      const addRes = await anotherProjectSpaceGroup.addMember(
        internalAdminAuth,
        {
          user: userJson,
        }
      );
      if (addRes.isErr()) {
        throw new Error(
          `Failed to add user to another project space group: ${addRes.error.message}`
        );
      }
    }

    // Refresh the auth object to update the groups list after adding the user to groups
    // This ensures that when createConversation checks permissions, it sees the updated groups
    await auth.refresh();

    // Create data source views in different spaces
    dsViewInProjectSpace = await DataSourceViewFactory.folder(
      workspace,
      projectSpace,
      auth.user() ?? null
    );
    dsViewInGlobalSpace = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      auth.user() ?? null
    );
    dsViewInAnotherProjectSpace = await DataSourceViewFactory.folder(
      workspace,
      anotherProjectSpace,
      auth.user() ?? null
    );

    vi.clearAllMocks();
  });

  describe("space restrictions for content fragments with content nodes", () => {
    beforeEach(async () => {
      // Mock getContentFragmentBlob to return a successful result for content nodes
      // The title will be taken from the content fragment input
      vi.mocked(getContentFragmentBlob).mockImplementation(async (auth, cf) => {
        const nodeDataSourceViewId = isContentFragmentInputWithContentNode(cf)
          ? (dsViewInProjectSpace?.id ?? 1)
          : 1;
        return new Ok({
          contentType: "text/plain",
          fileId: null,
          nodeId: "test-node-id",
          nodeDataSourceViewId,
          nodeType: "document",
          sourceUrl: null,
          textBytes: null,
          title: cf.title,
        });
      });
    });

    it("should allow content fragment from the same space as the conversation", async () => {
      // Create a conversation in a project space
      const conversationWithoutContent = await ConversationFactory.create(
        auth,
        {
          agentConfigurationId: agentConfig.sId,
          messagesCreatedAt: [],
          spaceId: projectSpace.id,
        }
      );

      const fetchedConversationResult = await getConversation(
        auth,
        conversationWithoutContent.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      conversation = fetchedConversationResult.value;

      // Create a content fragment with a node from the same space
      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Content Fragment",
        nodeId: "test-node-id",
        nodeDataSourceViewId: dsViewInProjectSpace.sId,
      };

      const result = await postNewContentFragment(
        auth,
        conversation,
        contentFragment,
        {
          username: auth.getNonNullableUser().username,
          fullName: auth.getNonNullableUser().fullName(),
          email: auth.getNonNullableUser().email,
          profilePictureUrl: null,
        }
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.title).toBe("Test Content Fragment");
      }
    });

    it("should allow content fragment from the global space in a project conversation", async () => {
      // Create a conversation in a project space
      const conversationWithoutContent = await ConversationFactory.create(
        auth,
        {
          agentConfigurationId: agentConfig.sId,
          messagesCreatedAt: [],
          spaceId: projectSpace.id,
        }
      );

      const fetchedConversationResult = await getConversation(
        auth,
        conversationWithoutContent.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      conversation = fetchedConversationResult.value;

      // Create a content fragment with a node from the global space
      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Content Fragment from Global Space",
        nodeId: "test-node-id",
        nodeDataSourceViewId: dsViewInGlobalSpace.sId,
      };

      const result = await postNewContentFragment(
        auth,
        conversation,
        contentFragment,
        {
          username: auth.getNonNullableUser().username,
          fullName: auth.getNonNullableUser().fullName(),
          email: auth.getNonNullableUser().email,
          profilePictureUrl: null,
        }
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.title).toBe(
          "Test Content Fragment from Global Space"
        );
      }
    });

    it("should reject content fragment from a different project space", async () => {
      // Create a conversation in a project space
      const conversationWithoutContent = await ConversationFactory.create(
        auth,
        {
          agentConfigurationId: agentConfig.sId,
          messagesCreatedAt: [],
          spaceId: projectSpace.id,
        }
      );

      const fetchedConversationResult = await getConversation(
        auth,
        conversationWithoutContent.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      conversation = fetchedConversationResult.value;

      // Try to create a content fragment with a node from a different project space
      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Content Fragment from Another Space",
        nodeId: "test-node-id",
        nodeDataSourceViewId: dsViewInAnotherProjectSpace.sId,
      };

      const result = await postNewContentFragment(
        auth,
        conversation,
        contentFragment,
        {
          username: auth.getNonNullableUser().username,
          fullName: auth.getNonNullableUser().fullName(),
          email: auth.getNonNullableUser().email,
          profilePictureUrl: null,
        }
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "Only content fragments from the project space or the global space are allowed in a project conversation"
        );
      }
      // Verify getContentFragmentBlob was not called since the space check failed first
      expect(getContentFragmentBlob).not.toHaveBeenCalled();
    });

    it("should allow content fragment from any space when conversation has no spaceId", async () => {
      // Create a conversation without a spaceId
      const conversationWithoutContent = await ConversationFactory.create(
        auth,
        {
          agentConfigurationId: agentConfig.sId,
          messagesCreatedAt: [],
          spaceId: undefined,
        }
      );

      const fetchedConversationResult = await getConversation(
        auth,
        conversationWithoutContent.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      conversation = fetchedConversationResult.value;

      // Create a content fragment with a node from any space (should be allowed)
      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Content Fragment",
        nodeId: "test-node-id",
        nodeDataSourceViewId: dsViewInAnotherProjectSpace.sId,
      };

      const result = await postNewContentFragment(
        auth,
        conversation,
        contentFragment,
        {
          username: auth.getNonNullableUser().username,
          fullName: auth.getNonNullableUser().fullName(),
          email: auth.getNonNullableUser().email,
          profilePictureUrl: null,
        }
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.title).toBe("Test Content Fragment");
      }
    });

    it("should return error when data source view is not found", async () => {
      // Create a conversation in a project space
      const conversationWithoutContent = await ConversationFactory.create(
        auth,
        {
          agentConfigurationId: agentConfig.sId,
          messagesCreatedAt: [],
          spaceId: projectSpace.id,
        }
      );

      const fetchedConversationResult = await getConversation(
        auth,
        conversationWithoutContent.sId
      );
      if (fetchedConversationResult.isErr()) {
        throw new Error("Failed to fetch conversation");
      }
      conversation = fetchedConversationResult.value;

      // Try to create a content fragment with a non-existent data source view
      const contentFragment: ContentFragmentInputWithContentNode = {
        title: "Test Content Fragment",
        nodeId: "test-node-id",
        nodeDataSourceViewId: "non-existent-ds-view-id",
      };

      const result = await postNewContentFragment(
        auth,
        conversation,
        contentFragment,
        {
          username: auth.getNonNullableUser().username,
          fullName: auth.getNonNullableUser().fullName(),
          email: auth.getNonNullableUser().email,
          profilePictureUrl: null,
        }
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Data source view not found");
      }
      // Verify getContentFragmentBlob was not called since the data source view check failed first
      expect(getContentFragmentBlob).not.toHaveBeenCalled();
    });
  });
});
