import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { assert, describe, expect, it } from "vitest";

import handler from "./index";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

async function setupGetRequest() {
  const { req, res, workspace } = await createPublicApiMockRequest({
    method: "GET",
  });

  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "builder" });
  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const conversation = await ConversationFactory.create(userAuth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });

  req.query.wId = workspace.sId;
  req.query.cId = conversation.sId;
  req.url = `/api/v1/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;

  return { req, res, workspace };
}

describe("GET /api/v1/w/[wId]/assistant/conversations/[cId]", () => {
  it("returns 200 when private conversation URLs are disabled", async () => {
    const { req, res, workspace } = await setupGetRequest();

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      privateConversationUrlsByDefault: false,
    });
    assert(updateResult.isOk(), "Failed to disable private conversation URLs");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("returns 404 conversation_not_found when private conversation URLs are enabled", async () => {
    const { req, res, workspace } = await setupGetRequest();

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      privateConversationUrlsByDefault: true,
    });
    assert(updateResult.isOk(), "Failed to enable private conversation URLs");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("conversation_not_found");
  });

  it("returns 200 for project conversations when private conversation URLs are enabled", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "GET",
      systemKey: true,
    });

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const projectSpace = await SpaceFactory.project(workspace, adminUser.id);
    const addMemberResult = await projectSpace.addMembers(adminAuth, {
      userIds: [adminUser.sId],
    });
    assert(addMemberResult.isOk(), "Failed to add admin user to project space");
    const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(refreshedAdminAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [projectSpace.id],
      spaceId: projectSpace.id,
      messagesCreatedAt: [new Date()],
    });

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      privateConversationUrlsByDefault: true,
    });
    assert(updateResult.isOk(), "Failed to enable private conversation URLs");

    req.query.wId = workspace.sId;
    req.query.cId = conversation.sId;
    req.url = `/api/v1/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });
});
