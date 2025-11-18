import { beforeEach, describe, expect, it } from "vitest";

import {
  createAgentMessages,
  createUserMentions,
} from "@app/lib/api/assistant/conversation/mentions";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessage, Mention } from "@app/lib/models/assistant/conversation";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  AgentMention,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  WorkspaceType,
} from "@app/types";

describe("createAgentMessages", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;
  let agentConfig1: LightAgentConfigurationType;
  let agentConfig2: LightAgentConfigurationType;

  beforeEach(async () => {
    // Create workspace, user, spaces, and groups using the helper
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Create test agent configurations
    agentConfig1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 1",
      description: "First test agent",
    });

    agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 2",
      description: "Second test agent",
    });

    // Create a conversation using the factory
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig1.sId,
      messagesCreatedAt: [], // No messages initially
      visibility: "unlisted",
    });
  });

  it("should create agent messages for valid agent mentions", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name}`,
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } satisfies AgentMention,
    ];

    const result = await createAgentMessages({
      mentions,
      agentConfigurations: [agentConfig1],
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
      skipToolsValidation: false,
      nextMessageRank: 1,
      conversation,
      userMessage,
    });

    expect(result).toHaveLength(1);
    expect(result[0].m.configuration.sId).toBe(agentConfig1.sId);
    expect(result[0].m.status).toBe("created");
    expect(result[0].m.skipToolsValidation).toBe(false);

    // Verify database records were created
    const mentionInDb = await Mention.findOne({
      where: {
        messageId: messageRow.id,
        agentConfigurationId: agentConfig1.sId,
      },
    });
    expect(mentionInDb).not.toBeNull();

    const agentMessageInDb = await AgentMessage.findByPk(result[0].row.id);
    expect(agentMessageInDb).not.toBeNull();
    expect(agentMessageInDb?.status).toBe("created");
  });

  it("should create multiple agent messages for multiple mentions", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name} and @${agentConfig2.name}`,
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
      {
        configurationId: agentConfig2.sId,
      } as AgentMention,
    ];

    const result = await createAgentMessages({
      mentions,
      agentConfigurations: [agentConfig1, agentConfig2],
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
      skipToolsValidation: false,
      nextMessageRank: 1,
      conversation,
      userMessage,
    });

    expect(result).toHaveLength(2);
    expect(result[0].m.configuration.sId).toBe(agentConfig1.sId);
    expect(result[1].m.configuration.sId).toBe(agentConfig2.sId);

    // Verify both mentions were created
    const mentionsInDb = await Mention.findAll({
      where: {
        messageId: messageRow.id,
      },
    });
    expect(mentionsInDb).toHaveLength(2);
  });

  it("should skip mentions for configurations not in the list", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello agent",
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
      {
        configurationId: "non-existent-agent",
      } as AgentMention,
    ];

    // Only pass agentConfig1, not the non-existent one
    const result = await createAgentMessages({
      mentions,
      agentConfigurations: [agentConfig1],
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
      skipToolsValidation: false,
      nextMessageRank: 1,
      conversation,
      userMessage,
    });

    // Should only create one agent message for the valid configuration
    expect(result).toHaveLength(1);
    expect(result[0].m.configuration.sId).toBe(agentConfig1.sId);
  });

  it("should return empty array when no agent mentions are provided", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
      });

    const result = await createAgentMessages({
      mentions: [],
      agentConfigurations: [agentConfig1],
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
      skipToolsValidation: false,
      nextMessageRank: 1,
      conversation,
      userMessage,
    });

    expect(result).toHaveLength(0);
  });

  it("should set skipToolsValidation correctly", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name}`,
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
    ];

    const result = await createAgentMessages({
      mentions,
      agentConfigurations: [agentConfig1],
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
      skipToolsValidation: true,
      nextMessageRank: 1,
      conversation,
      userMessage,
    });

    expect(result).toHaveLength(1);
    expect(result[0].m.skipToolsValidation).toBe(true);
    expect(result[0].row.skipToolsValidation).toBe(true);
  });

  it("should set parentAgentMessageId when context origin is agent_handover", async () => {
    const originMessageId = "original-agent-msg-123";

    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name}`,
        origin: "agent_handover",
        originMessageId,
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
    ];

    const result = await createAgentMessages({
      mentions,
      agentConfigurations: [agentConfig1],
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
      skipToolsValidation: false,
      nextMessageRank: 1,
      conversation,
      userMessage,
    });

    expect(result).toHaveLength(1);
    expect(result[0].m.parentAgentMessageId).toBe(originMessageId);
  });

  it("should set parentAgentMessageId to null when context origin is not agent_handover", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name}`,
        origin: "web",
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
    ];

    const result = await createAgentMessages({
      mentions,
      agentConfigurations: [agentConfig1],
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
      skipToolsValidation: false,
      nextMessageRank: 1,
      conversation,
      userMessage,
    });

    expect(result).toHaveLength(1);
    expect(result[0].m.parentAgentMessageId).toBeNull();
  });

  it("should increment message rank correctly for multiple agent messages", async () => {
    const { messageRow, userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${agentConfig1.name} and @${agentConfig2.name}`,
      });

    const mentions: MentionType[] = [
      {
        configurationId: agentConfig1.sId,
      } as AgentMention,
      {
        configurationId: agentConfig2.sId,
      } as AgentMention,
    ];

    const nextMessageRank = 10;

    const result = await createAgentMessages({
      mentions,
      agentConfigurations: [agentConfig1, agentConfig2],
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
      skipToolsValidation: false,
      nextMessageRank,
      conversation,
      userMessage,
    });

    expect(result).toHaveLength(2);
    // Note: The function increments nextMessageRank internally, so ranks should be 10 and 11
    expect(result[0].m.rank).toBe(nextMessageRank);
    expect(result[1].m.rank).toBe(nextMessageRank + 1);
  });
});

describe("createUserMentions", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    // Create workspace, user, spaces, and groups using the helper
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Create a conversation using the factory
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it("should store user mentions in the database", async () => {
    const mentionedUser = auth.getNonNullableUser();

    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${mentionedUser.username}`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
    ];

    await createUserMentions(auth, {
      mentions,
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
    });

    // Verify user mention was stored in the database
    const userMentionInDb = await Mention.findOne({
      where: {
        messageId: messageRow.id,
        userId: mentionedUser.id,
      },
    });
    expect(userMentionInDb).not.toBeNull();
    expect(userMentionInDb?.userId).toBe(mentionedUser.id);
    expect(userMentionInDb?.agentConfigurationId).toBeNull();
  });

  it("should handle multiple user mentions", async () => {
    const user1 = auth.getNonNullableUser();
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });

    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${user1.username} and @${user2.username}`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: user1.sId.toString(),
      },
      {
        type: "user",
        userId: user2.sId.toString(),
      },
    ];

    await createUserMentions(auth, {
      mentions,
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
    });

    // Verify both user mentions were stored
    const allMentionsInDb = await Mention.findAll({
      where: {
        messageId: messageRow.id,
      },
      order: [["userId", "ASC"]],
    });
    expect(allMentionsInDb).toHaveLength(2);
    expect(allMentionsInDb[0].userId).toBe(user1.id);
    expect(allMentionsInDb[1].userId).toBe(user2.id);
    // Both should have null agentConfigurationId
    expect(allMentionsInDb[0].agentConfigurationId).toBeNull();
    expect(allMentionsInDb[1].agentConfigurationId).toBeNull();
  });

  it("should handle empty user mentions array", async () => {
    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello",
    });

    const mentions: MentionType[] = [];

    await createUserMentions(auth, {
      mentions,
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
    });

    // Verify no mentions were stored
    const allMentionsInDb = await Mention.findAll({
      where: {
        messageId: messageRow.id,
      },
    });
    expect(allMentionsInDb).toHaveLength(0);
  });

  it("should only process user mentions and ignore agent mentions", async () => {
    const mentionedUser = auth.getNonNullableUser();

    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${mentionedUser.username} and @agent`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
      {
        configurationId: "some-agent-id",
      } as AgentMention,
    ];

    await createUserMentions(auth, {
      mentions,
      message: messageRow,
      owner: workspace,
      transaction: undefined as never,
    });

    // Verify only user mention was stored, agent mention should be ignored
    const allMentionsInDb = await Mention.findAll({
      where: {
        messageId: messageRow.id,
      },
    });
    expect(allMentionsInDb).toHaveLength(1);
    expect(allMentionsInDb[0].userId).toBe(mentionedUser.id);
    expect(allMentionsInDb[0].agentConfigurationId).toBeNull();
  });
});
