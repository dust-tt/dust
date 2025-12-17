import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./index";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "DELETE"
) {
  const { req, res, workspace, user, authenticator, systemSpace, globalSpace } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = systemSpace.sId;

  return {
    req,
    res,
    workspace,
    space: systemSpace,
    user,
    authenticator,
    globalSpace,
  };
}

describe("DELETE /api/w/[wId]/spaces/[spaceId]/mcp_views/[svId]", () => {
  it("should delete a server view", async () => {
    const { req, res, workspace, globalSpace } = await setupTest(
      "admin",
      "DELETE"
    );

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await FeatureFlagFactory.basic("dev_mcp_actions", workspace);

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      {
        name: "primitive_types_debugger",
        useCase: null,
      }
    );

    const serverView = await MCPServerViewFactory.create(
      workspace,
      internalServer.id,
      globalSpace
    );
    req.query.svId = serverView.sId;
    req.query.spaceId = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("deleted", true);

    const deletedServerView = await MCPServerViewResource.fetchById(
      auth,
      serverView.sId
    );

    expect(deletedServerView).toBe(null);
  });

  it("should return 403 when user is not authorized to delete a server view", async () => {
    const { req, res, workspace, user } = await setupTest("builder", "DELETE");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const regularSpace = await SpaceFactory.regular(workspace);
    await regularSpace.groups[0].addMember(auth, user.toJSON());

    await FeatureFlagFactory.basic("dev_mcp_actions", workspace);

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      {
        name: "primitive_types_debugger",
        useCase: null,
      }
    );

    const serverView = await MCPServerViewFactory.create(
      workspace,
      internalServer.id,
      regularSpace
    );
    req.query.svId = serverView.sId;
    req.query.spaceId = regularSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("error");
    expect(responseData.error).toHaveProperty("type", "mcp_auth_error");
    expect(responseData.error).toHaveProperty(
      "message",
      "User is not authorized to remove tools from a space."
    );
  });

  it("should return 404 when server view doesn't exist", async () => {
    const { req, res, workspace } = await setupTest("admin", "DELETE");
    req.query.svId = makeSId("mcp_server_view", {
      id: 1000,
      workspaceId: workspace.id,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "data_source_not_found",
        message: "MCP Server View not found",
      },
    });
  });
});

describe("Method Support /api/w/[wId]/spaces/[spaceId]/mcp_views/[svId]", () => {
  it("only supports DELETE method", async () => {
    const { req, res, workspace, authenticator, globalSpace } = await setupTest(
      "admin",
      "GET"
    );

    await FeatureFlagFactory.basic("dev_mcp_actions", workspace);

    const mcpServer = await InternalMCPServerInMemoryResource.makeNew(
      authenticator,
      {
        name: "primitive_types_debugger",
        useCase: null,
      }
    );

    const serverView = await MCPServerViewFactory.create(
      workspace,
      mcpServer.id,
      globalSpace
    );
    req.query.svId = serverView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, only DELETE is expected.",
      },
    });
  });
});
