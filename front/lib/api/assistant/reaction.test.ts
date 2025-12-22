import { beforeEach, describe, expect, it } from "vitest";

import {
  createMessageReaction,
  deleteMessageReaction,
  getMessageReactions,
} from "@app/lib/api/assistant/reaction";
import type { Authenticator } from "@app/lib/auth";
import {
  MessageModel,
  MessageReactionModel,
} from "@app/lib/models/agent/conversation";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ConversationWithoutContentType } from "@app/types";

describe("getMessageReactions", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationWithoutContentType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("should return empty reactions  when no reactions exist", async () => {
    const result = await getMessageReactions(auth, conversation);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const reactions = result.value;
      expect(reactions.length).toBe(2);
      // The conversation has messages but no reactions yet.
      reactions.forEach((messageReactions) => {
        expect(messageReactions.reactions).toEqual([]);
      });
    }
  });

  it("should return reactions for messages with single reaction", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    // Create a reaction.
    await MessageReactionModel.create({
      messageId: message.id,
      userId: user!.id,
      userContextUsername: user!.username,
      userContextFullName: user!.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    const result = await getMessageReactions(auth, conversation);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const reactions = result.value;
      const messageReactions = reactions.find(
        (r) => r.messageId === message.sId
      );
      expect(messageReactions).toEqual({
        messageId: message.sId,
        reactions: [
          {
            emoji: "👍",
            users: [
              {
                fullName: expect.anything(),
                userId: user!.sId,
                username: expect.anything(),
              },
            ],
          },
        ],
      });
    }
  });

  it("should group reactions by emoji and list multiple users", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user1 = auth.user();

    // Create another user.
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });

    // Both users react with the same emoji.
    await MessageReactionModel.create({
      messageId: message.id,
      userId: user1!.id,
      userContextUsername: user1!.username,
      userContextFullName: user1!.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    await MessageReactionModel.create({
      messageId: message.id,
      userId: user2.id,
      userContextUsername: user2.username,
      userContextFullName: user2.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    const result = await getMessageReactions(auth, conversation);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const reactions = result.value;
      const messageReactions = reactions.find(
        (r) => r.messageId === message.sId
      );
      expect(messageReactions).toEqual({
        messageId: message.sId,
        reactions: [
          {
            emoji: "👍",
            users: [
              {
                fullName: expect.anything(),
                userId: user1?.sId,
                username: expect.anything(),
              },
              {
                fullName: expect.anything(),
                userId: user2?.sId,
                username: expect.anything(),
              },
            ],
          },
        ],
      });
    }
  });

  it("should separate different emoji reactions", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    // Create multiple reactions with different emojis.
    await MessageReactionModel.create({
      messageId: message.id,
      userId: user!.id,
      userContextUsername: user!.username,
      userContextFullName: user!.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    await MessageReactionModel.create({
      messageId: message.id,
      userId: user!.id,
      userContextUsername: user!.username,
      userContextFullName: user!.fullName(),
      reaction: "❤️",
      workspaceId: workspace.id,
    });

    await MessageReactionModel.create({
      messageId: message.id,
      userId: user!.id,
      userContextUsername: user!.username,
      userContextFullName: user!.fullName(),
      reaction: "🎉",
      workspaceId: workspace.id,
    });

    const result = await getMessageReactions(auth, conversation);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const reactions = result.value;
      const messageReactions = reactions.find(
        (r) => r.messageId === message.sId
      );
      expect(messageReactions).toEqual({
        messageId: message.sId,
        reactions: [
          {
            emoji: "👍",
            users: [
              {
                fullName: expect.anything(),
                userId: user?.sId,
                username: expect.anything(),
              },
            ],
          },
          {
            emoji: "❤️",
            users: [
              {
                fullName: expect.anything(),
                userId: user?.sId,
                username: expect.anything(),
              },
            ],
          },
          {
            emoji: "🎉",
            users: [
              {
                fullName: expect.anything(),
                userId: user?.sId,
                username: expect.anything(),
              },
            ],
          },
        ],
      });
    }
  });

  it("should skip reactions without user association", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    // Create a reaction without a user (orphaned reaction).
    await MessageReactionModel.create({
      messageId: message.id,
      userId: null,
      userContextUsername: "deleted_user",
      userContextFullName: "Deleted User",
      reaction: "👍",
      workspaceId: workspace.id,
    });

    const result = await getMessageReactions(auth, conversation);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const reactions = result.value;
      const messageReactions = reactions.find(
        (r) => r.messageId === message.sId
      );
      expect(messageReactions).toEqual({
        messageId: message.sId,
        reactions: [],
      });
    }
  });
});

describe("createMessageReaction", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationWithoutContentType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("should create a reaction with authenticated user", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    const result = await createMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: user!.fullName(),
      },
      reaction: "👍",
    });

    expect(result).toBe(true);

    // Verify the reaction was created in the database.
    const reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(1);
    expect(reactions[0].userId).toBe(user!.id);
    expect(reactions[0].reaction).toBe("👍");
    expect(reactions[0].userContextUsername).toBe(user!.username);
    expect(reactions[0].userContextFullName).toBe(user!.fullName());
  });

  it("should create a reaction without user (e.g., from Slack)", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const result = await createMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      user: null,
      context: {
        username: "slack_user",
        fullName: "Slack User",
      },
      reaction: "🎉",
    });

    expect(result).toBe(true);

    // Verify the reaction was created with null userId.
    const reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(1);
    expect(reactions[0].userId).toBeNull();
    expect(reactions[0].reaction).toBe("🎉");
    expect(reactions[0].userContextUsername).toBe("slack_user");
    expect(reactions[0].userContextFullName).toBe("Slack User");
  });

  it("should create a reaction with null fullName in context", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    const result = await createMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: null,
      },
      reaction: "❤️",
    });

    expect(result).toBe(true);

    // Verify the reaction was created with null fullName.
    const reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(1);
    expect(reactions[0].userContextFullName).toBeNull();
  });

  it("should return null when message does not exist", async () => {
    const user = auth.user();

    const result = await createMessageReaction(auth, {
      messageId: "nonexistent_message_id",
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: user!.fullName(),
      },
      reaction: "👍",
    });

    expect(result).toBeNull();

    // Verify no reaction was created.
    const reactions = await MessageReactionModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(0);
  });

  it("should allow multiple reactions from same user with different emojis", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    const result1 = await createMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: user!.fullName(),
      },
      reaction: "👍",
    });

    const result2 = await createMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: user!.fullName(),
      },
      reaction: "❤️",
    });

    expect(result1).toBe(true);
    expect(result2).toBe(true);

    // Verify both reactions were created.
    const reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(2);
    const emojis = reactions.map((r) => r.reaction);
    expect(emojis).toContain("👍");
    expect(emojis).toContain("❤️");
  });
});

describe("deleteMessageReaction", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationWithoutContentType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("should delete an existing reaction", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    // Create a reaction first.
    await MessageReactionModel.create({
      messageId: message.id,
      userId: user!.id,
      userContextUsername: user!.username,
      userContextFullName: user!.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    // Verify the reaction exists.
    let reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(1);

    // Delete the reaction.
    const result = await deleteMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: user!.fullName(),
      },
      reaction: "👍",
    });

    expect(result).toBe(true);

    // Verify the reaction was deleted.
    reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(0);
  });

  it("should delete reaction without user (e.g., from Slack)", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    // Create a reaction without user.
    await MessageReactionModel.create({
      messageId: message.id,
      userId: null,
      userContextUsername: "slack_user",
      userContextFullName: "Slack User",
      reaction: "🎉",
      workspaceId: workspace.id,
    });

    // Delete the reaction.
    const result = await deleteMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      user: null,
      context: {
        username: "slack_user",
        fullName: "Slack User",
      },
      reaction: "🎉",
    });

    expect(result).toBe(true);

    // Verify the reaction was deleted.
    const reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(0);
  });

  it("should return false when reaction does not exist", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    // Try to delete a non-existent reaction.
    const result = await deleteMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: user!.fullName(),
      },
      reaction: "👍",
    });

    expect(result).toBe(false);
  });

  it("should return null when message does not exist", async () => {
    const user = auth.user();

    const result = await deleteMessageReaction(auth, {
      messageId: "nonexistent_message_id",
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: user!.fullName(),
      },
      reaction: "👍",
    });

    expect(result).toBeNull();
  });

  it("should only delete matching reaction when multiple exist", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    // Create multiple reactions.
    await MessageReactionModel.create({
      messageId: message.id,
      userId: user!.id,
      userContextUsername: user!.username,
      userContextFullName: user!.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    await MessageReactionModel.create({
      messageId: message.id,
      userId: user!.id,
      userContextUsername: user!.username,
      userContextFullName: user!.fullName(),
      reaction: "❤️",
      workspaceId: workspace.id,
    });

    // Delete one reaction.
    const result = await deleteMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: user!.fullName(),
      },
      reaction: "👍",
    });

    expect(result).toBe(true);

    // Verify only the specified reaction was deleted.
    const reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(1);
    expect(reactions[0].reaction).toBe("❤️");
  });

  it("should only delete reaction matching user and context", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user1 = auth.user();

    // Create another user.
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });

    // Both users react with the same emoji.
    await MessageReactionModel.create({
      messageId: message.id,
      userId: user1!.id,
      userContextUsername: user1!.username,
      userContextFullName: user1!.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    await MessageReactionModel.create({
      messageId: message.id,
      userId: user2.id,
      userContextUsername: user2.username,
      userContextFullName: user2.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    // Delete user1's reaction.
    const result = await deleteMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user1!,
      context: {
        username: user1!.username,
        fullName: user1!.fullName(),
      },
      reaction: "👍",
    });

    expect(result).toBe(true);

    // Verify only user1's reaction was deleted.
    const reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(1);
    expect(reactions[0].userId).toBe(user2.id);
  });

  it("should handle deletion with null fullName in context", async () => {
    // Get the first message.
    const messages = await MessageModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(messages.length).toBe(2);
    const message = messages[0];

    const user = auth.user();

    // Create a reaction with null fullName.
    await MessageReactionModel.create({
      messageId: message.id,
      userId: user!.id,
      userContextUsername: user!.username,
      userContextFullName: null,
      reaction: "❤️",
      workspaceId: workspace.id,
    });

    // Delete the reaction with matching null fullName.
    const result = await deleteMessageReaction(auth, {
      messageId: message.sId,
      conversation,
      // @ts-expect-error - for testing purposes
      user: user!,
      context: {
        username: user!.username,
        fullName: null,
      },
      reaction: "❤️",
    });

    expect(result).toBe(true);

    // Verify the reaction was deleted.
    const reactions = await MessageReactionModel.findAll({
      where: {
        messageId: message.id,
        workspaceId: workspace.id,
      },
    });
    expect(reactions.length).toBe(0);
  });
});
