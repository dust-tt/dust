import type { RequestMethod } from "node-mocks-http";
import { describe, expect } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { makeSId } from "@app/lib/resources/string_ids";
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

  const space = await SpaceFactory.system(workspace, t);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = space.sId;

  return { req, res, workspace, space, auth: authenticator };
}

describe("GET /api/w/[wId]/mcp/[serverId]", () => {
  itInTransaction("should return server details", async (t) => {
    const { req, res, workspace } = await setupTest(t);

    const server = await RemoteMCPServerFactory.create(workspace);
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("server");
  });

  itInTransaction("should return 404 when server doesn't exist", async (t) => {
    const { req, res, workspace } = await setupTest(t);
    req.query.serverId = makeSId("remote_mcp_server", {
      id: 1000,
      workspaceId: workspace.id,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "data_source_not_found",
        message: "Remote MCP Server not found",
      },
    });
  });
});

describe("PATCH /api/w/[wId]/mcp/[serverId]", () => {
  itInTransaction(
    "should return 400 when no update fields are provided",
    async (t) => {
      const { req, res, workspace } = await setupTest(t, "admin", "PATCH");

      const server = await RemoteMCPServerFactory.create(workspace);
      req.query.serverId = server.sId;
      req.body = {};

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "At least one field to update is required",
        },
      });
    }
  );

  itInTransaction("should update remote MCP server name", async (t) => {
    const { req, res, workspace } = await setupTest(t, "admin", "PATCH");

    const server = await RemoteMCPServerFactory.create(workspace);
    req.query.serverId = server.sId;
    req.body = { name: "Updated Server Name" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.server.name).toBe("Updated Server Name");
  });

  itInTransaction(
    "should fail to update remote MCP server name when user",
    async (t) => {
      const { req, res, workspace } = await setupTest(t, "user", "PATCH");

      const server = await RemoteMCPServerFactory.create(workspace);
      req.query.serverId = server.sId;
      req.body = { name: "Updated Server Name" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    }
  );

  itInTransaction(
    "should update remote MCP server oAuthUseCase and all views when admin",
    async (t) => {
      const { req, res, workspace, auth } = await setupTest(
        t,
        "admin",
        "PATCH"
      );

      const server = await RemoteMCPServerFactory.create(workspace);
      req.query.serverId = server.sId;

      // Create a view in the global space.
      const space = await SpaceFactory.global(workspace, t);
      await MCPServerViewFactory.create(workspace, server.sId, space);

      // Verify initial state
      const initialViews = await MCPServerViewResource.listByMCPServer(
        auth,
        server.sId
      );
      for (const view of initialViews) {
        expect(view.oAuthUseCase).toBeNull();
      }

      // Update the server
      req.body = { oAuthUseCase: "platform_actions" };
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

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
    "should fail to update remote MCP server oAuthUseCase when user",
    async (t) => {
      const { req, res, workspace, auth } = await setupTest(t, "user", "PATCH");

      // Create an internal MCP server
      const admin = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await FeatureFlagFactory.basic("dev_mcp_actions", workspace);
      const server = await InternalMCPServerInMemoryResource.makeNew(
        admin,
        {
          name: "primitive_types_debugger",
          useCase: null,
        },
        t
      );
      req.query.serverId = server.id;

      // Create a view in the global space.
      const space = await SpaceFactory.global(workspace, t);
      await MCPServerViewFactory.create(workspace, server.id, space);

      // Verify initial state
      const initialViews = await MCPServerViewResource.listByMCPServer(
        auth,
        server.id
      );
      for (const view of initialViews) {
        expect(view.oAuthUseCase).toBeNull();
      }

      // Update the server
      req.body = { oAuthUseCase: "personal_actions" };
      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    }
  );

  itInTransaction(
    "should update internal MCP server oAuthUseCase and all views when admin",
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
      req.query.serverId = server.id;

      // Create a view in the global space.
      const space = await SpaceFactory.global(workspace, t);
      await MCPServerViewFactory.create(workspace, server.id, space);

      // Verify initial state
      const initialViews = await MCPServerViewResource.listByMCPServer(
        auth,
        server.id
      );
      for (const view of initialViews) {
        expect(view.oAuthUseCase).toBeNull();
      }

      // Update the server
      req.body = { oAuthUseCase: "personal_actions" };
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

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
});

describe("DELETE /api/w/[wId]/mcp/[serverId]", () => {
  itInTransaction("should delete a server when admin", async (t) => {
    const { req, res, workspace } = await setupTest(t, "admin", "DELETE");

    const server = await RemoteMCPServerFactory.create(workspace);
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("deleted", true);

    const deletedServer = await RemoteMCPServerResource.fetchById(
      { getNonNullableWorkspace: () => workspace } as any,
      server.sId
    );

    expect(deletedServer).toBeNull();
  });
});

describe("DELETE /api/w/[wId]/mcp/[serverId]", () => {
  itInTransaction("should fail to delete a server when user", async (t) => {
    const { req, res, workspace } = await setupTest(t, "user", "DELETE");

    const server = await RemoteMCPServerFactory.create(workspace);
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("error");

    const deletedServer = await RemoteMCPServerResource.fetchById(
      { getNonNullableWorkspace: () => workspace } as any,
      server.sId
    );

    expect(deletedServer).toStrictEqual(server);
  });
});

describe("Method Support /api/w/[wId]/mcp/[serverId]", () => {
  itInTransaction("supports GET, PATCH, and DELETE methods", async (t) => {
    const { req, res, workspace, space } = await setupTest(t, "admin", "PUT");

    const server = await RemoteMCPServerFactory.create(workspace, space);
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message:
          "The method passed is not supported, GET, PATCH, DELETE are expected.",
      },
    });
  });
});
