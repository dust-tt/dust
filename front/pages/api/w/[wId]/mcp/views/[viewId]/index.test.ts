import type { RequestMethod } from "node-mocks-http";
import { describe, expect } from "vitest";
import { it } from "vitest";

import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";

import handler from "./index";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace, authenticator, globalSpace, systemSpace } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  // Set up common query parameters
  req.query.wId = workspace.sId;

  return { req, res, workspace, globalSpace, systemSpace, auth: authenticator };
}

describe("PATCH /api/w/[wId]/mcp/views/[viewId]", () => {
  it("should return 400 when no update fields are provided", async () => {
    const { req, res, workspace, auth } = await setupTest("admin", "PATCH");

    const server = await RemoteMCPServerFactory.create(workspace);

    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );

    expect(systemView).toBeDefined();

    req.query.viewId = systemView!.sId;
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.message).toContain("Validation error:");
  });

  it("should return 400 when trying to update non-system view", async () => {
    const { req, res, workspace, globalSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const server = await RemoteMCPServerFactory.create(workspace);

    // Create a view in global space (not system space)
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );

    req.query.viewId = serverView.sId;
    req.body = {
      oAuthUseCase: "platform_actions",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe(
      "Updates can only be performed on system views."
    );
  });

  it("should update oAuthUseCase for all views of the same MCP server when admin", async () => {
    const { req, res, workspace, auth, globalSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const server = await RemoteMCPServerFactory.create(workspace);

    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );

    expect(systemView).toBeDefined();

    req.query.viewId = systemView!.sId;

    // Create additional views in global space for the same server
    await MCPServerViewFactory.create(workspace, server.sId, globalSpace);

    // Verify initial state
    const initialViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.sId
    );
    for (const view of initialViews) {
      expect(view.oAuthUseCase).toBeNull();
    }

    // Update via system view
    req.query.viewId = systemView!.sId;
    req.body = { oAuthUseCase: "platform_actions" };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.success).toBe(true);
    expect(responseData.serverView.oAuthUseCase).toBe("platform_actions");

    // Verify all views were updated
    const updatedViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.sId
    );
    for (const view of updatedViews) {
      expect(view.oAuthUseCase).toBe("platform_actions");
    }
  });

  it("should update name and description for all views of the same MCP server when admin", async () => {
    const { req, res, workspace, auth, globalSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const server = await RemoteMCPServerFactory.create(workspace);

    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );

    expect(systemView).toBeDefined();

    // Create additional views in global space for the same server
    await MCPServerViewFactory.create(workspace, server.sId, globalSpace);

    // Update via system view
    req.query.viewId = systemView!.sId;
    req.body = {
      name: "Updated View Name",
      description: "Updated Description",
    };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.success).toBe(true);
    expect(responseData.serverView.name).toBe("Updated View Name");
    expect(responseData.serverView.description).toBe("Updated Description");

    // Verify all views were updated
    const updatedViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.sId
    );
    for (const view of updatedViews) {
      expect(view.name).toBe("Updated View Name");
      expect(view.description).toBe("Updated Description");
    }
  });

  it("should fail to update view when user has insufficient permissions", async () => {
    const { req, res, workspace, auth } = await setupTest("user", "PATCH");

    const server = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );

    expect(systemView).toBeDefined();

    req.query.viewId = systemView!.sId;

    req.body = { oAuthUseCase: "platform_actions" };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("workspace_auth_error");
  });

  it("should work with internal MCP servers and update all views", async () => {
    const { req, res, workspace, auth, globalSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    // Create an internal MCP server
    await FeatureFlagFactory.basic("dev_mcp_actions", workspace);
    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "primitive_types_debugger",
      useCase: null,
    });

    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.id
      );

    expect(systemView).toBeDefined();

    // Create additional views in global space
    await MCPServerViewFactory.create(workspace, server.id, globalSpace);

    // Verify initial state
    const initialViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.id
    );
    for (const view of initialViews) {
      expect(view.oAuthUseCase).toBeNull();
    }

    // Update via system view
    req.query.viewId = systemView!.sId;
    req.body = { oAuthUseCase: "personal_actions" };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.success).toBe(true);
    expect(responseData.serverView.oAuthUseCase).toBe("personal_actions");

    // Verify all views were updated
    const updatedViews = await MCPServerViewResource.listByMCPServer(
      auth,
      server.id
    );
    for (const view of updatedViews) {
      expect(view.oAuthUseCase).toBe("personal_actions");
    }
  });

  it("should support updating null name and description", async () => {
    const { req, res, workspace, auth } = await setupTest("admin", "PATCH");

    const server = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );

    expect(systemView).toBeDefined();

    req.query.viewId = systemView!.sId;
    req.body = {
      name: null,
      description: null,
    };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.success).toBe(true);
    expect(responseData.serverView.name).toBeNull();
    expect(responseData.serverView.description).toBeNull();
  });
});

describe("Method Support /api/w/[wId]/mcp/views/[viewId]", () => {
  it("supports only PATCH method", async () => {
    const { req, res, workspace, auth } = await setupTest("admin", "DELETE");

    const server = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );

    expect(systemView).toBeDefined();

    req.query.viewId = systemView!.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, PATCH is expected.",
      },
    });
  });
});
