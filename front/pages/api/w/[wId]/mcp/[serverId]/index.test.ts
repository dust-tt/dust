import type { RequestMethod } from "node-mocks-http";
import { describe, expect } from "vitest";

import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

async function setupTest(
  t: any,
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    role,
    method,
  });

  const space = await SpaceFactory.system(workspace, t);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = space.sId;

  return { req, res, workspace, space };
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
});

describe("DELETE /api/w/[wId]/mcp/[serverId]", () => {
  itInTransaction("should delete a server", async (t) => {
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
