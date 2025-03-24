import { describe, expect, vi } from "vitest";

import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./index";

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp/remote/[serverId]", () => {
  itInTransaction("should return server details", async (db) => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
    });

    const space = await SpaceFactory.global(workspace, db);

    const server = await RemoteMCPServerResource.makeNew(
      {
        workspaceId: workspace.id,
        name: "Test Server",
        url: "https://test-server.example.com",
        description: "Test description",
        cachedTools: [{ name: "tool", description: "Tool description" }],
        lastSyncAt: new Date(),
        sharedSecret: "secret123",
      },
      space
    );

    req.query.wId = workspace.sId;
    req.query.spaceId = space.sId;
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("success", true);
    expect(responseData).toHaveProperty("data");

    const serverData = responseData.data;
    expect(serverData).toEqual({
      id: server.sId,
      workspaceId: workspace.sId,
      name: server.name,
      description: server.description || "",
      tools: server.cachedTools,
      url: server.url,
      sharedSecret: server.sharedSecret,
    });
  });

  itInTransaction("should return 404 when server doesn't exist", async (db) => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
    });

    const space = await SpaceFactory.global(workspace, db);

    req.query.wId = workspace.sId;
    req.query.spaceId = space.sId;
    req.query.serverId = "non-existent-server-id";

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

describe("PATCH /api/w/[wId]/spaces/[spaceId]/mcp/remote/[serverId]", () => {
  itInTransaction(
    "should return 400 when no update fields are provided",
    async (db) => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        role: "builder",
        method: "PATCH",
      });

      const space = await SpaceFactory.global(workspace, db);

      const server = await RemoteMCPServerResource.makeNew(
        {
          workspaceId: workspace.id,
          name: "Test Server",
          url: "https://test-server.example.com",
          description: "Test description",
          cachedTools: [],
          lastSyncAt: new Date(),
          sharedSecret: "secret123",
        },
        space
      );

      req.query.wId = workspace.sId;
      req.query.spaceId = space.sId;
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
});

describe("DELETE /api/w/[wId]/spaces/[spaceId]/mcp/remote/[serverId]", () => {
  itInTransaction("should delete a server", async (db) => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "DELETE",
    });

    const space = await SpaceFactory.global(workspace, db);

    const server = await RemoteMCPServerResource.makeNew(
      {
        workspaceId: workspace.id,
        name: "Test Server",
        url: "https://test-server.example.com",
        description: "Test description",
        cachedTools: [{ name: "tool", description: "Tool description" }],
        lastSyncAt: new Date(),
        sharedSecret: "secret123",
      },
      space
    );

    req.query.wId = workspace.sId;
    req.query.spaceId = space.sId;
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("success", true);
    expect(responseData).toHaveProperty("data");
    expect(responseData.data).toHaveProperty("id", server.sId);

    const deletedServer = await RemoteMCPServerResource.fetchById(
      { workspace: () => workspace } as any,
      server.sId
    );

    expect(deletedServer).toBeNull();
  });
});

describe("Method Support /api/w/[wId]/spaces/[spaceId]/mcp/remote/[serverId]", () => {
  itInTransaction("supports GET, PATCH, and DELETE methods", async (db) => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "PUT",
    });

    const space = await SpaceFactory.global(workspace, db);

    const server = await RemoteMCPServerResource.makeNew(
      {
        workspaceId: workspace.id,
        name: "Test Server",
        url: "https://test-server.example.com",
        description: "Test description",
        cachedTools: [],
        lastSyncAt: new Date(),
        sharedSecret: "secret123",
      },
      space
    );

    req.query.wId = workspace.sId;
    req.query.spaceId = space.sId;
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message:
          "The method passed is not supported, GET, PATCH, or DELETE is expected.",
      },
    });
  });
});
