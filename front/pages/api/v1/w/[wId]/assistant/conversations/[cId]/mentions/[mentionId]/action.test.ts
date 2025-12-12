import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  MentionModel,
  MessageModel,
  PendingMentionModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./[action]";

async function setupTest(
  method: RequestMethod = "POST",
  action: "confirm" | "decline" = "confirm"
) {
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
    mentionId: pendingMention.id.toString(),
    action,
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
    message,
  };
}

describe("POST /api/v1/w/[wId]/assistant/conversations/[cId]/mentions/[mentionId]/[action]", () => {
  it("should confirm a pending mention successfully", async () => {
    const { req, res, auth, mentionedUser, pendingMention } = await setupTest(
      "POST",
      "confirm"
    );

    await handler(req, res, auth);

    expect(res.statusCode).toBe(200);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.status).toBe("confirmed");

    // Verify pending mention was updated
    const updatedMention = await PendingMentionModel.findByPk(
      pendingMention.id
    );
    expect(updatedMention?.status).toBe("accepted");

    // Verify mention record was created
    const mention = await MentionModel.findOne({
      where: {
        messageId: pendingMention.messageId,
        userId: mentionedUser.id,
      },
    });
    expect(mention).not.toBeNull();
  });

  it("should decline a pending mention successfully", async () => {
    const { req, res, auth, pendingMention, mentionedUser } = await setupTest(
      "POST",
      "decline"
    );

    await handler(req, res, auth);

    expect(res.statusCode).toBe(200);
    const jsonData = JSON.parse(res._getData());
    expect(jsonData.status).toBe("declined");

    // Verify pending mention was updated
    const updatedMention = await PendingMentionModel.findByPk(
      pendingMention.id
    );
    expect(updatedMention?.status).toBe("declined");

    // Verify mention record was NOT created
    const mention = await MentionModel.findOne({
      where: {
        messageId: pendingMention.messageId,
        userId: mentionedUser.id,
      },
    });
    expect(mention).toBeNull();
  });

  it("should return 404 if pending mention not found", async () => {
    const { req, res, auth } = await setupTest("POST", "confirm");

    // Set invalid mention ID
    req.query.mentionId = "99999";

    await handler(req, res, auth);

    expect(res.statusCode).toBe(404);
  });

  it("should return 405 for non-POST methods", async () => {
    const { req, res, auth } = await setupTest("GET", "confirm");

    await handler(req, res, auth);

    expect(res.statusCode).toBe(405);
  });

  it("should return 400 for invalid action", async () => {
    const { req, res, auth } = await setupTest("POST", "confirm");

    req.query.action = "invalid";

    await handler(req, res, auth);

    expect(res.statusCode).toBe(400);
  });
});
