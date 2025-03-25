import type { RequestMethod } from "node-mocks-http";
import { describe, expect } from "vitest";

import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

async function setupTest(
  t: any,
  role: "builder" | "user" | "admin" = "builder",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    role,
    method,
  });

  const space = await SpaceFactory.global(workspace, t);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = space.sId;

  return { req, res, workspace, space };
}

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp/remote/[serverId]", () => {
  itInTransaction("should return server details", async (t) => {
    const { req, res, workspace, space } = await setupTest(t);

    const server = await RemoteMCPServerFactory.create(workspace, space, {
      sharedSecret: "secret123",
    });
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("success", true);
    expect(responseData).toHaveProperty("data");
  });

  itInTransaction("should return 404 when server doesn't exist", async (t) => {
    const { req, res } = await setupTest(t);
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
    async (t) => {
      const { req, res, workspace, space } = await setupTest(
        t,
        "builder",
        "PATCH"
      );

      const server = await RemoteMCPServerFactory.create(workspace, space);
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
  itInTransaction("should delete a server", async (t) => {
    const { req, res, workspace, space } = await setupTest(
      t,
      "builder",
      "DELETE"
    );

    const server = await RemoteMCPServerFactory.create(workspace, space);
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
  itInTransaction("supports GET, PATCH, and DELETE methods", async (t) => {
    const { req, res, workspace, space } = await setupTest(t, "builder", "PUT");

    const server = await RemoteMCPServerFactory.create(workspace, space);
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
