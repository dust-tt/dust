import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { assert, describe, expect, it } from "vitest";

import handler from "./index";

async function setupUserRequestWithConversation({
  privateByDefaultEnabled,
}: {
  privateByDefaultEnabled: boolean;
}) {
  const { req, res, workspace, auth, user, globalSpace } =
    await createPrivateApiMockRequest({
      role: "user",
      method: "GET",
    });

  const adminUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
  const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
    adminUser.sId,
    workspace.sId
  );

  const conversation = await ConversationFactory.create(adminAuth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    requestedSpaceIds: [globalSpace.id],
    messagesCreatedAt: [new Date()],
  });

  const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
    privateConversationUrlsByDefault: privateByDefaultEnabled,
  });
  assert(
    updateResult.isOk(),
    "Failed to update private conversation URLs setting"
  );

  req.query.wId = workspace.sId;
  req.query.cId = conversation.sId;
  req.url = `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;

  return { req, res, workspace, auth, user, conversation };
}

describe("GET /api/w/[wId]/assistant/conversations/[cId]", () => {
  it("returns 200 for non-participants when private conversation URLs are disabled", async () => {
    const { req, res } = await setupUserRequestWithConversation({
      privateByDefaultEnabled: false,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("returns 403 conversation_access_restricted for non-participants when private conversation URLs are enabled", async () => {
    const { req, res } = await setupUserRequestWithConversation({
      privateByDefaultEnabled: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe(
      "conversation_access_restricted"
    );
  });

  it("returns 200 for participants when private conversation URLs are enabled", async () => {
    const { req, res, auth, user, conversation } =
      await setupUserRequestWithConversation({
        privateByDefaultEnabled: true,
      });

    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: user.toJSON(),
      lastReadAt: null,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("returns 200 for admins when private conversation URLs are enabled", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "GET",
      });

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });
    const regularUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
      regularUser.sId,
      workspace.sId
    );

    const conversation = await ConversationFactory.create(regularUserAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      privateConversationUrlsByDefault: true,
    });
    assert(
      updateResult.isOk(),
      "Failed to update private conversation URLs setting"
    );

    req.query.wId = workspace.sId;
    req.query.cId = conversation.sId;
    req.url = `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });
});
