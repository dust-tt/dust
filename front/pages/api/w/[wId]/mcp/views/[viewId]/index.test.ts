import type { RequestMethod } from "node-mocks-http";
import { describe, expect } from "vitest";

import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

async function setupTest(
  t: any,
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  const systemSpace = await SpaceFactory.system(workspace, t);

  // Set up common query parameters
  req.query.wId = workspace.sId;

  return { req, res, workspace, systemSpace, auth: authenticator };
}

describe("PATCH /api/w/[wId]/mcp/views/[viewId]", () => {
  itInTransaction(
    "should return 400 when no update fields are provided",
    async (t) => {
      const { req, res, workspace, auth } = await setupTest(
        t,
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
      req.body = {};

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = res._getJSONData();
      expect(responseData.error.message).toContain("Validation error:");
    }
  );

  itInTransaction(
    "should return 400 when trying to update non-system view",
    async (t) => {
      const { req, res, workspace } = await setupTest(t, "admin", "PATCH");

      const server = await RemoteMCPServerFactory.create(workspace);

      // Create a view in global space (not system space)
      const globalSpace = await SpaceFactory.global(workspace, t);
      const serverView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace,
        t
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
    }
  );

  itInTransaction(
    "should update oAuthUseCase for all views of the same MCP server when admin",
    async (t) => {
      const { req, res, workspace, auth } = await setupTest(
        t,
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
      const globalSpace = await SpaceFactory.global(workspace, t);
      await MCPServerViewFactory.create(workspace, server.sId, globalSpace, t);

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
    }
  );

  itInTransaction(
    "should update name and description for all views of the same MCP server when admin",
    async (t) => {
      const { req, res, workspace, auth } = await setupTest(
        t,
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
      const globalSpace = await SpaceFactory.global(workspace, t);
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
    }
  );

  itInTransaction(
    "should fail to update view when user has insufficient permissions",
    async (t) => {
      const { req, res, workspace, auth } = await setupTest(t, "user", "PATCH");

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
    }
  );

  itInTransaction(
    "should work with internal MCP servers and update all views",
    async (t) => {
      const { req, res, workspace, auth } = await setupTest(
        t,
        "admin",
        "PATCH"
      );

      // Create an internal MCP server
      await FeatureFlagFactory.basic("dev_mcp_actions", workspace);
      const server = await InternalMCPServerInMemoryResource.makeNew(
        auth,
        {
          name: "primitive_types_debugger",
          useCase: null,
        },
        t
      );

      const systemView =
        await MCPServerViewResource.getMCPServerViewForSystemSpace(
          auth,
          server.id
        );

      expect(systemView).toBeDefined();

      // Create additional views in global space
      const globalSpace = await SpaceFactory.global(workspace, t);
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
    }
  );

  itInTransaction(
    "should support updating null name and description",
    async (t) => {
      const { req, res, workspace, auth } = await setupTest(
        t,
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
    }
  );
});

describe("Method Support /api/w/[wId]/mcp/views/[viewId]", () => {
  itInTransaction("supports only PATCH method", async (t) => {
    const { req, res, workspace, auth } = await setupTest(t, "admin", "DELETE");

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
