import type { Authenticator } from "@app/lib/auth";
import {
  CompactionMessageModel,
  MessageModel,
  MessageReactionModel,
} from "@app/lib/models/agent/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function getMessageByRank(
  auth: Authenticator,
  conversationId: ModelId,
  rank: number
): Promise<MessageModel> {
  const message = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId,
      rank,
    },
  });
  if (!message) {
    throw new Error(`No message found at rank ${rank}`);
  }
  return message;
}

function postReaction(
  workspace: { sId: string },
  cId: string,
  mId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/messages/${mId}/reactions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function deleteReaction(
  workspace: { sId: string },
  cId: string,
  mId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/messages/${mId}/reactions`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/assistant/conversations/:cId/messages/:mId/reactions", () => {
  it("creates a reaction on a user message", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const userMsg = await getMessageByRank(auth, conversation.id, 0);

    const response = await postReaction(
      workspace,
      conversation.sId,
      userMsg.sId,
      {
        reaction: "👍",
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const reactions = await MessageReactionModel.findAll({
      where: { workspaceId: workspace.id, messageId: userMsg.id },
    });
    expect(reactions).toHaveLength(1);
    expect(reactions[0].reaction).toBe("👍");
  });

  it("creates a reaction on an agent message", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const agentMsg = await getMessageByRank(auth, conversation.id, 1);

    const response = await postReaction(
      workspace,
      conversation.sId,
      agentMsg.sId,
      {
        reaction: "🎉",
      }
    );

    expect(response.status).toBe(200);

    const reactions = await MessageReactionModel.findAll({
      where: { workspaceId: workspace.id, messageId: agentMsg.id },
    });
    expect(reactions).toHaveLength(1);
    expect(reactions[0].reaction).toBe("🎉");
  });

  it("returns 400 when the message does not exist", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const response = await postReaction(
      workspace,
      conversation.sId,
      "msg_does_not_exist",
      { reaction: "👍" }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 when reacting to a content fragment", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const contentFragmentMsg =
      await ConversationFactory.createContentFragmentMessage({
        auth,
        workspace,
        conversationId: conversation.id,
        rank: 2,
        title: "attachment.txt",
      });

    const response = await postReaction(
      workspace,
      conversation.sId,
      contentFragmentMsg.sId,
      { reaction: "👍" }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("content fragment");

    const reactions = await MessageReactionModel.findAll({
      where: { workspaceId: workspace.id, messageId: contentFragmentMsg.id },
    });
    expect(reactions).toHaveLength(0);
  });

  it("returns 400 when reacting to a compaction message", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const compactionRow = await CompactionMessageModel.create({
      status: "created",
      content: null,
      workspaceId: workspace.id,
    });
    const compactionMsg = await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: 2,
      conversationId: conversation.id,
      compactionMessageId: compactionRow.id,
      workspaceId: workspace.id,
    });

    const response = await postReaction(
      workspace,
      conversation.sId,
      compactionMsg.sId,
      { reaction: "👍" }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("compaction");
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({ method: "POST" });

    const response = await postReaction(
      workspace,
      "conv_does_not_exist",
      "msg_whatever",
      { reaction: "👍" }
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("conversation_not_found");
  });

  it("returns 400 when the reaction body is missing", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const userMsg = await getMessageByRank(auth, conversation.id, 0);

    const response = await postReaction(
      workspace,
      conversation.sId,
      userMsg.sId,
      {}
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("DELETE /api/w/:wId/assistant/conversations/:cId/messages/:mId/reactions", () => {
  it("deletes an existing reaction", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const userMsg = await getMessageByRank(auth, conversation.id, 0);

    await MessageReactionModel.create({
      messageId: userMsg.id,
      userId: user.id,
      userContextUsername: user.username,
      userContextFullName: user.fullName(),
      reaction: "👍",
      workspaceId: workspace.id,
    });

    const response = await deleteReaction(
      workspace,
      conversation.sId,
      userMsg.sId,
      { reaction: "👍" }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const reactions = await MessageReactionModel.findAll({
      where: { workspaceId: workspace.id, messageId: userMsg.id },
    });
    expect(reactions).toHaveLength(0);
  });

  it("returns 400 when no matching reaction exists", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const userMsg = await getMessageByRank(auth, conversation.id, 0);

    const response = await deleteReaction(
      workspace,
      conversation.sId,
      userMsg.sId,
      { reaction: "🤷" }
    );

    expect(response.status).toBe(400);
  });
});
