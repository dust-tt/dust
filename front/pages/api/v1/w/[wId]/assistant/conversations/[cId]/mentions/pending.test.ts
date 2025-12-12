import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  MessageModel,
  PendingMentionModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./pending";

async function setupTest(method: RequestMethod = "GET") {
  const { req, res, workspace } = await createPublicApiMockRequest({
    systemKey: false,
    method,
  });

  // Create users
  const mentionerUser = await UserFactory.basic();
  const mentionedUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, mentionerUser, {
    role: "builder",
  });
  await MembershipFactory.associate(workspace, mentionedUser, {
    role: "builder",
  });

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    mentionerUser.sId,
    workspace.sId
  );

  // Create conversation
  const conversation = await ConversationModel.create({
    sId: `conv_${Date.now()}`,
    workspaceId: workspace.id,
    visibility: "unlisted",
  });

  // Create user message
  const userMessage = await UserMessageModel.create({
    content: `Hey @${mentionedUser.username}, can you help?`,
    userContextUsername: mentionerUser.username,
    userContextTimezone: "UTC",
    userContextFullName: mentionerUser.fullName,
    userContextEmail: mentionerUser.email,
    userContextProfilePictureUrl: null,
    userContextOrigin: "web",
    workspaceId: workspace.id,
  });

  const message = await MessageModel.create({
    sId: `msg_${Date.now()}`,
    rank: 0,
    conversationId: conversation.id,
    userMessageId: userMessage.id,
    workspaceId: workspace.id,
  });

  // Create pending mention
  const pendingMention = await PendingMentionModel.create({
    workspaceId: workspace.id,
    conversationId: conversation.id,
    messageId: message.id,
    mentionedUserId: mentionedUser.id,
    mentionerUserId: mentionerUser.id,
    status: "pending",
  });

  // Set query params
  req.query = {
    wId: workspace.sId,
    cId: conversation.sId,
  };

  return {
    req,
    res,
    workspace,
    auth,
    mentionerUser,
    mentionedUser,
    conversation,
    pendingMention,
  };
}

describe("GET /api/v1/w/[wId]/assistant/conversations/[cId]/mentions/pending", () => {
  it("should fetch pending mentions successfully", async () => {
    const { req, res, auth, mentionedUser, mentionerUser } = await setupTest();

    await handler(req, res, auth);

    expect(res.statusCode).toBe(200);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.pendingMentions).toHaveLength(1);
    expect(jsonData.pendingMentions[0].status).toBe("pending");
    expect(jsonData.pendingMentions[0].mentionedUser.sId).toBe(
      mentionedUser.sId
    );
    expect(jsonData.pendingMentions[0].mentionerUser.sId).toBe(
      mentionerUser.sId
    );
  });

  it("should return empty array when no pending mentions", async () => {
    const { req, res, auth, pendingMention } = await setupTest();

    // Update the pending mention to accepted
    await pendingMention.update({ status: "accepted" });

    await handler(req, res, auth);

    expect(res.statusCode).toBe(200);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.pendingMentions).toHaveLength(0);
  });

  it("should return 405 for non-GET methods", async () => {
    const { req, res, auth } = await setupTest("POST");

    await handler(req, res, auth);

    expect(res.statusCode).toBe(405);
  });

  it("should return 400 for missing conversation ID", async () => {
    const { req, res, auth } = await setupTest();

    delete req.query.cId;

    await handler(req, res, auth);

    expect(res.statusCode).toBe(400);
  });
});
