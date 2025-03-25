import { describe, expect, vi } from "vitest";

import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

vi.mock(import("@app/lib/api/mcp"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    fetchServerMetadata: vi.fn().mockResolvedValue({
      name: "Test Server",
      description: "Test description",
      tools: [{ name: "test-tool", description: "Test tool description" }],
    }),
  };
});

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp/remote", () => {
  itInTransaction("should return a list of servers", async (db) => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
    });

    const space = await SpaceFactory.global(workspace, db);

    req.query.wId = workspace.sId;
    req.query.spaceId = space.sId;

    const server1 = await RemoteMCPServerResource.makeNew(
      {
        workspaceId: workspace.id,
        name: "Test Server 1",
        url: "https://test-server-1.example.com",
        description: "Test description 1",
        cachedTools: [{ name: "tool-1", description: "Tool 1 description" }],
        lastSyncAt: new Date(),
        sharedSecret: "secret1",
      },
      space
    );

    const server2 = await RemoteMCPServerResource.makeNew(
      {
        workspaceId: workspace.id,
        name: "Test Server 2",
        url: "https://test-server-2.example.com",
        description: "Test description 2",
        cachedTools: [{ name: "tool-2", description: "Tool 2 description" }],
        lastSyncAt: new Date(),
        sharedSecret: "secret2",
      },
      space
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("servers");
    expect(responseData.servers).toHaveLength(2);

    const returnedServers = responseData.servers;
    expect(returnedServers.map((s: { id: string }) => s.id)).toContain(
      server1.sId
    );
    expect(returnedServers.map((s: { id: string }) => s.id)).toContain(
      server2.sId
    );

    const server1Response = returnedServers.find(
      (s: { id: string }) => s.id === server1.sId
    );
    expect(server1Response).toEqual({
      id: server1.sId,
      workspaceId: workspace.sId,
      name: server1.name,
      description: server1.description || "",
      tools: server1.cachedTools,
      url: server1.url,
    });
  });

  itInTransaction(
    "should return empty array when no servers exist",
    async (db) => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        role: "builder",
      });

      const space = await SpaceFactory.global(workspace, db);

      req.query.wId = workspace.sId;
      req.query.spaceId = space.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = res._getJSONData();
      expect(responseData).toHaveProperty("servers");
      expect(responseData.servers).toBeInstanceOf(Array);
      expect(responseData.servers).toHaveLength(0);
    }
  );

  itInTransaction(
    "should return 403 when user is not a builder",
    async (db) => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        role: "user",
      });

      const space = await SpaceFactory.global(workspace, db);

      req.query.wId = workspace.sId;
      req.query.spaceId = space.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "data_source_auth_error",
          message: expect.stringContaining("Only users that are `builders`"),
        },
      });
    }
  );
});

describe("POST /api/w/[wId]/spaces/[spaceId]/mcp/remote", () => {
  itInTransaction("should return 400 when URL is missing", async (db) => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "POST",
    });

    const space = await SpaceFactory.global(workspace, db);

    req.query.wId = workspace.sId;
    req.query.spaceId = space.sId;

    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "URL is required",
      },
    });
  });

  itInTransaction(
    "should return 400 when server with URL already exists",
    async (db) => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        role: "builder",
        method: "POST",
      });

      const space = await SpaceFactory.global(workspace, db);

      const existingUrl = "https://existing-server.example.com";
      await RemoteMCPServerResource.makeNew(
        {
          workspaceId: workspace.id,
          name: "Existing Server",
          url: existingUrl,
          description: "Existing server description",
          cachedTools: [],
          lastSyncAt: new Date(),
          sharedSecret: "existing-secret",
        },
        space
      );

      req.query.wId = workspace.sId;
      req.query.spaceId = space.sId;

      req.body = {
        url: existingUrl,
      };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "A server with this URL already exists",
        },
      });
    }
  );
});

describe("Method Support /api/w/[wId]/spaces/[spaceId]/mcp/remote", () => {
  itInTransaction("only supports GET and POST methods", async (db) => {
    for (const method of ["DELETE", "PUT", "PATCH"] as const) {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        role: "builder",
        method,
      });

      const space = await SpaceFactory.global(workspace, db);

      req.query.wId = workspace.sId;
      req.query.spaceId = space.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  });
});
