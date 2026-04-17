import { createConversation } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

import handler from "./index";

async function fetchConversationOrThrow(
  auth: Awaited<ReturnType<typeof createPrivateApiMockRequest>>["auth"],
  conversationId: string
) {
  const result = await getConversation(auth, conversationId);
  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}

async function createUserMessage(
  auth: Awaited<ReturnType<typeof createPrivateApiMockRequest>>["auth"],
  {
    conversation,
    rank,
    content,
  }: {
    conversation: ConversationWithoutContentType;
    rank: number;
    content: string;
  }
): Promise<MessageModel> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const userMessage = await UserMessageModel.create({
    userId: user.id,
    workspaceId: workspace.id,
    content,
    userContextUsername: user.username,
    userContextTimezone: "UTC",
    userContextFullName: user.fullName(),
    userContextEmail: user.email,
    userContextProfilePictureUrl: user.imageUrl,
    userContextOrigin: "web",
    clientSideMCPServerIds: [],
  });

  return MessageModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    rank,
    conversationId: conversation.id,
    parentId: null,
    userMessageId: userMessage.id,
  });
}

async function createAgentMessage(
  auth: Awaited<ReturnType<typeof createPrivateApiMockRequest>>["auth"],
  {
    conversation,
    rank,
    parentId,
    status,
  }: {
    conversation: ConversationWithoutContentType;
    rank: number;
    parentId: number;
    status: "created" | "succeeded";
  }
): Promise<MessageModel> {
  const workspace = auth.getNonNullableWorkspace();

  const agentMessage = await AgentMessageModel.create({
    workspaceId: workspace.id,
    status,
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    agentConfigurationVersion: 0,
    skipToolsValidation: false,
    completedAt: status === "created" ? null : new Date(),
  });

  return MessageModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    rank,
    conversationId: conversation.id,
    parentId,
    agentMessageId: agentMessage.id,
  });
}

describe("POST /api/w/[wId]/assistant/conversations/[cId]/forks", () => {
  it("returns 405 for non-POST methods", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
    });

    req.query.cId = "conv_test";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 403 when the sessions branching feature flag is disabled", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
    });

    req.query.cId = "conv_test";
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("feature_flag_not_found");
  });

  it("creates a fork and returns the child conversation id", async () => {
    const { req, res, auth, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
    });

    await FeatureFlagFactory.basic(auth, "sessions_branching");

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: globalSpace.id,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Please continue from here.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    req.query.cId = parentConversation.sId;
    req.body = { sourceMessageId: sourceMessage.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { conversationId } = res._getJSONData();
    expect(res._getJSONData().conversation).toEqual({ sId: conversationId });
    const conversation = await fetchConversationOrThrow(auth, conversationId);

    expect(conversation.title).toBe("Parent conversation (forked)");
    expect(conversation.forkedFrom).toEqual({
      parentConversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
      branchedAt: expect.any(Number),
      user: auth.getNonNullableUser().toJSON(),
    });
    expect(conversation.depth).toBe(1);
    expect(conversation.spaceId).toBe(globalSpace.sId);
  });

  it("accepts an empty string body and resolves the latest source message", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });

    await FeatureFlagFactory.basic(auth, "sessions_branching");

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Please continue from here.",
    });
    const sourceMessage = await createAgentMessage(auth, {
      conversation: parentConversation,
      rank: 1,
      parentId: userMessage.id,
      status: "succeeded",
    });

    req.query.cId = parentConversation.sId;
    req.body = "";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { conversationId } = res._getJSONData();
    expect(res._getJSONData().conversation).toEqual({ sId: conversationId });
    const conversation = await fetchConversationOrThrow(auth, conversationId);

    expect(conversation.forkedFrom).toEqual({
      parentConversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
      branchedAt: expect.any(Number),
      user: auth.getNonNullableUser().toJSON(),
    });
  });

  it("returns 400 when the source message cannot be forked", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
    });

    await FeatureFlagFactory.basic(auth, "sessions_branching");

    const parentConversation = await createConversation(auth, {
      title: "Parent conversation",
      visibility: "unlisted",
      spaceId: null,
    });

    const userMessage = await createUserMessage(auth, {
      conversation: parentConversation,
      rank: 0,
      content: "Please continue from here.",
    });

    req.query.cId = parentConversation.sId;
    req.body = { sourceMessageId: userMessage.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });
});
