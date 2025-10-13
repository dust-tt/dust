import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./index";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  const space = await SpaceFactory.system(workspace);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = space.sId;

  return { req, res, workspace, space, auth: authenticator };
}

describe("GET /api/w/[wId]/mcp/[serverId]", () => {
  it("should return server details", async () => {
    const { req, res, workspace } = await setupTest();

    const server = await RemoteMCPServerFactory.create(workspace);
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("server");
    expect(responseData.server).toHaveProperty("customHeaders");
    expect(responseData.server.customHeaders).toBeNull(); // No headers set initially
  });

  it("should return 404 when server doesn't exist", async () => {
    const { req, res, workspace } = await setupTest();
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
  it("should return update headers when headers are provided", async () => {
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const server = await RemoteMCPServerFactory.create(workspace);
    req.query.serverId = server.sId;
    req.body = {
      customHeaders: [
        { key: "test-key-1", value: "value1" },
        { key: "test-key-2", value: "value2" },
      ],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.server).toHaveProperty("customHeaders");
    expect(responseData.server.customHeaders).toBeDefined();
    expect(responseData.server.customHeaders).toMatchObject({
      "test-key-1": "value1",
      "test-key-2": "value2",
    });
  });
});

describe("PATCH /api/w/[wId]/mcp/[serverId]", () => {
  it("should return 400 when no update fields are provided", async () => {
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const server = await RemoteMCPServerFactory.create(workspace);
    req.query.serverId = server.sId;
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.message).toContain("Validation error:");
  });
});

describe("DELETE /api/w/[wId]/mcp/[serverId]", () => {
  it("should delete a server when admin", async () => {
    const { req, res, workspace } = await setupTest("admin", "DELETE");

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
  it("should fail to delete a server when user", async () => {
    const { req, res, workspace } = await setupTest("user", "DELETE");

    const server = await RemoteMCPServerFactory.create(workspace);
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);

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
  it("supports GET, PATCH, and DELETE methods", async () => {
    const { req, res, workspace, space } = await setupTest("admin", "PUT");

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
