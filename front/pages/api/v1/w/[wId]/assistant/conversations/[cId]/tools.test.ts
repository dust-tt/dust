import type { RequestMethod } from "node-mocks-http";
import { assert, describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types";

import handler from "./tools";

async function setupTest(method: RequestMethod = "POST", systemKey = true) {
  const { req, res, workspace } = await createPublicApiMockRequest({
    systemKey,
    method,
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

  req.query.wId = workspace.sId;
  req.query.cId = conversation.sId;

  // Simulate tool server impersonation: set user header for auth exchange
  req.headers["x-api-user-email"] = user.email!;

  const systemSpace = await SpaceFactory.system(workspace);
  const globalSpace = await SpaceFactory.global(workspace);

  return {
    req,
    res,
    workspace,
    conversation,
    systemSpace,
    globalSpace,
    auth,
    adminAuth,
    user,
  };
}

describe("POST /api/v1/w/[wId]/assistant/conversations/[cId]/tools", () => {
  it("should add a new tool to conversation with system key", async () => {
    const { req, res, workspace, auth, adminAuth, conversation, globalSpace } =
      await setupTest("POST");

    const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        adminAuth,
        remoteMCPServer.sId
      );
    assert(systemView, "MCP server view not found");
    const mcpServerView = await MCPServerViewResource.create(adminAuth, {
      systemView,
      space: globalSpace,
    });

    req.body = {
      action: "add",
      mcp_server_view_id: mcpServerView.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
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
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: false,
      method: "POST",
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

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData().error.type).toBe("not_authenticated");
  });

  it("should return 404 when MCP server view doesn't exist", async () => {
    const { req, res } = await setupTest("POST");
    req.body = {
      action: "add",
      mcp_server_view_id: "non-existent-view",
    };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("should return 400 for invalid request body", async () => {
    const { req, res } = await setupTest("POST");
    req.body = null;
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("should return 405 for unsupported methods", async () => {
    const { req, res } = await setupTest("GET");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
