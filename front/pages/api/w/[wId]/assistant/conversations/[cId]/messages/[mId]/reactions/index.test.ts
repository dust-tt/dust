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
import { describe, expect, it } from "vitest";

import handler from "./index";

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

describe("POST /api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/reactions", () => {
  it("creates a reaction on a user message", async () => {
    const { req, res, auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const userMsg = await getMessageByRank(auth, conversation.id, 0);

    req.query.cId = conversation.sId;
    req.query.mId = userMsg.sId;
    req.body = { reaction: "👍" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    const reactions = await MessageReactionModel.findAll({
      where: { workspaceId: workspace.id, messageId: userMsg.id },
    });
    expect(reactions).toHaveLength(1);
    expect(reactions[0].reaction).toBe("👍");
  });

  it("creates a reaction on an agent message", async () => {
    const { req, res, auth, workspace } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const agentMsg = await getMessageByRank(auth, conversation.id, 1);

    req.query.cId = conversation.sId;
    req.query.mId = agentMsg.sId;
    req.body = { reaction: "🎉" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const reactions = await MessageReactionModel.findAll({
      where: { workspaceId: workspace.id, messageId: agentMsg.id },
    });
    expect(reactions).toHaveLength(1);
    expect(reactions[0].reaction).toBe("🎉");
  });

  it("returns 400 when the message does not exist", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    req.query.cId = conversation.sId;
    req.query.mId = "msg_does_not_exist";
    req.body = { reaction: "👍" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 when reacting to a content fragment", async () => {
    const { req, res, auth, workspace } = await createPrivateApiMockRequest({
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

    req.query.cId = conversation.sId;
    req.query.mId = contentFragmentMsg.sId;
    req.body = { reaction: "👍" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("content fragment");

    // Ensure the mutation was not persisted.
    const reactions = await MessageReactionModel.findAll({
      where: { workspaceId: workspace.id, messageId: contentFragmentMsg.id },
    });
    expect(reactions).toHaveLength(0);
  });

  it("returns 400 when reacting to a compaction message", async () => {
    const { req, res, auth, workspace } = await createPrivateApiMockRequest({
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

    req.query.cId = conversation.sId;
    req.query.mId = compactionMsg.sId;
    req.body = { reaction: "👍" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("compaction");
  });

  it("returns 404 when the conversation does not exist", async () => {
    const { req, res } = await createPrivateApiMockRequest({ method: "POST" });

    req.query.cId = "conv_does_not_exist";
    req.query.mId = "msg_whatever";
    req.body = { reaction: "👍" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("conversation_not_found");
  });

  it("returns 400 when the reaction body is missing", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const userMsg = await getMessageByRank(auth, conversation.id, 0);

    req.query.cId = conversation.sId;
    req.query.mId = userMsg.sId;
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 405 for unsupported methods", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const userMsg = await getMessageByRank(auth, conversation.id, 0);

    req.query.cId = conversation.sId;
    req.query.mId = userMsg.sId;
    req.body = { reaction: "👍" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});

describe("DELETE /api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/reactions", () => {
  it("deletes an existing reaction", async () => {
    const { req, res, auth, user, workspace } =
      await createPrivateApiMockRequest({ method: "DELETE" });
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

    req.query.cId = conversation.sId;
    req.query.mId = userMsg.sId;
    req.body = { reaction: "👍" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    const reactions = await MessageReactionModel.findAll({
      where: { workspaceId: workspace.id, messageId: userMsg.id },
    });
    expect(reactions).toHaveLength(0);
  });

  it("returns 400 when no matching reaction exists", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const userMsg = await getMessageByRank(auth, conversation.id, 0);

    req.query.cId = conversation.sId;
    req.query.mId = userMsg.sId;
    req.body = { reaction: "🤷" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });
});
