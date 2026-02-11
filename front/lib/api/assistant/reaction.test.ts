import { beforeEach, describe, expect, it } from "vitest";

import {
  createMessageReaction,
  deleteMessageReaction,
} from "@app/lib/api/assistant/reaction";
import type { Authenticator } from "@app/lib/auth";
import {
  MessageModel,
  MessageReactionModel,
} from "@app/lib/models/agent/conversation";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";

describe("deleteMessageReaction", () => {
  let auth: Authenticator;
  let workspace: WorkspaceType;
  let user: UserResource;
  let agentConfig: LightAgentConfigurationType;
  let conversation: ConversationType;
  let messageId: string;

  beforeEach(async () => {
    const {
      authenticator,
      workspace: w,
      user: u,
      conversationsSpace,
    } = await createResourceTest({});
    auth = authenticator;
    workspace = w;
    user = u;

    // Create an agent configuration
    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    // Create a conversation with messages
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });

    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello darkness my old friend, I've come to talk with you again.`,
    });

    messageId = messageRow.sId;
  });

  it("should delete a reaction with proper workspace isolation", async () => {
    // Create a reaction
    const created = await createMessageReaction(auth, {
      messageId,
      conversation,
      user: user.toJSON(),
      context: {
        username: user.username,
        fullName: user.fullName(),
      },
      reaction: "👍",
    });
    expect(created).toBe(true);

    // Verify reaction was created
    const reactionsBefore = await MessageReactionModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });
    expect(reactionsBefore.length).toBe(1);
    expect(reactionsBefore[0].reaction).toBe("👍");
    expect(reactionsBefore[0].workspaceId).toBe(workspace.id);

    // Delete the reaction
    const deleted = await deleteMessageReaction(auth, {
      messageId,
      conversation,
      user: user.toJSON(),
      context: {
        username: user.username,
        fullName: user.fullName(),
      },
      reaction: "👍",
    });
    expect(deleted).toBe(true);

    // Verify the reaction was deleted
    const reactionsAfter = await MessageReactionModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });
    expect(reactionsAfter.length).toBe(0);
  });

  it("should only delete reactions matching user context", async () => {
    // Create another user in the same workspace
    const { UserFactory } = await import("@app/tests/utils/UserFactory");
    const { MembershipFactory } = await import(
      "@app/tests/utils/MembershipFactory"
    );
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, {
      role: "user",
    });

    // Create reactions from both users on the same message
    await createMessageReaction(auth, {
      messageId,
      conversation,
      user: user.toJSON(),
      context: {
        username: user.username,
        fullName: user.fullName(),
      },
      reaction: "👍",
    });

    // Get messageModelId for second user's reaction
    const messageModel = await MessageModel.findOne({
      where: {
        sId: messageId,
        conversationId: conversation.id,
        workspaceId: workspace.id,
      },
    });
    if (!messageModel) {
      throw new Error("Message not found");
    }

    await MessageReactionModel.create({
      messageId: messageModel.id,
      userId: user2.id,
      userContextUsername: user2.username,
      userContextFullName: user2.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    // Verify both reactions exist
    const reactionsBefore = await MessageReactionModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });
    expect(reactionsBefore.length).toBe(2);

    // Delete only user1's reaction
    const deleted = await deleteMessageReaction(auth, {
      messageId,
      conversation,
      user: user.toJSON(),
      context: {
        username: user.username,
        fullName: user.fullName(),
      },
      reaction: "👍",
    });
    expect(deleted).toBe(true);

    // Verify only user1's reaction is deleted
    const reactionsAfter = await MessageReactionModel.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });
    expect(reactionsAfter.length).toBe(1);
    expect(reactionsAfter[0].userId).toBe(user2.id);
  });
});
