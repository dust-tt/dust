import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import { assert, describe, expect, it } from "vitest";

async function setupTest(systemKey = true) {
  const { workspace, key } = await createPublicApiMockRequest({
    systemKey,
  });

  // Create a real user in the workspace and use a user-scoped authenticator
  // so ConversationFactory and subsequent writes have a non-null user.
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "builder" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });

  const systemSpace = await SpaceFactory.system(workspace);
  const globalSpace = await SpaceFactory.global(workspace);

  return {
    workspace,
    key,
    conversation,
    systemSpace,
    globalSpace,
    auth,
    adminAuth,
    user,
  };
}

function postTools(
  workspace: { sId: string },
  key: { secret: string },
  cId: string,
  body: unknown,
  userEmail?: string
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${key.secret}`,
    "Content-Type": "application/json",
  };
  if (userEmail) {
    headers["x-api-user-email"] = userEmail;
  }
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/conversations/${cId}/tools`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/v1/w/[wId]/assistant/conversations/[cId]/tools", () => {
  it("should add a new tool to conversation with system key", async () => {
    const { workspace, key, auth, adminAuth, conversation, globalSpace, user } =
      await setupTest();

    const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        adminAuth,
        remoteMCPServer.sId
      );
    assert(systemView, "MCP server view not found");
    const { view: mcpServerView } = await MCPServerViewResource.create(
      adminAuth,
      {
        systemView,
        space: globalSpace,
      }
    );

    const response = await postTools(
      workspace,
      key,
      conversation.sId,
      {
        action: "add",
        mcp_server_view_id: mcpServerView.sId,
      },
      user.email!
    );

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.success).toBe(true);

    const relationship = await ConversationResource.fetchMCPServerViews(
      auth,
      conversation
    );
    expect(relationship).toHaveLength(1);
    expect(relationship[0].enabled).toBe(true);
  });

  it("should return 401 when not using a system key", async () => {
    // Build a valid conversation so the handler reaches the system-key check.
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: false,
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

    const response = await postTools(workspace, key, conversation.sId, {
      action: "add",
      mcp_server_view_id: "non-existent-view",
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.type).toBe("not_authenticated");
  });

  it("should return 404 when MCP server view doesn't exist", async () => {
    const { workspace, key, conversation, user } = await setupTest();
    const response = await postTools(
      workspace,
      key,
      conversation.sId,
      {
        action: "add",
        mcp_server_view_id: "non-existent-view",
      },
      user.email!
    );
    expect(response.status).toBe(404);
  });

  it("should return 400 for invalid request body", async () => {
    const { workspace, key, conversation, user } = await setupTest();
    const response = await postTools(
      workspace,
      key,
      conversation.sId,
      null,
      user.email!
    );
    expect(response.status).toBe(400);
  });
});
