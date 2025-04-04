import type { RequestMethod } from "node-mocks-http";
import { describe, expect, vi } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./sync";

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

vi.mock(import("@app/lib/actions/mcp_actions"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    fetchRemoteServerMetaDataByURL: vi.fn().mockResolvedValue({
      name: "Updated Server Name",
      description: "Updated server description",
      tools: [
        { name: "updated-tool", description: "Updated tool description" },
      ],
    }),
  };
});

describe("POST /api/w/[wId]/mcp/[serverId]/sync", () => {
  itInTransaction("should return 404 when server doesn't exist", async (t) => {
    const { req, res } = await setupTest(t, "admin", "POST");
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

  itInTransaction("should return 403 when user is not an admin", async (t) => {
    const { req, res, workspace, space } = await setupTest(t, "user", "POST");
    const server = await RemoteMCPServerFactory.create(workspace, space);
    req.query.serverId = server.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "data_source_auth_error",
        message: expect.stringContaining("Only users that are `admins`"),
      },
    });
  });

  itInTransaction("only POST method is supported", async (t) => {
    for (const method of ["GET", "DELETE", "PUT", "PATCH"] as const) {
      const { req, res, workspace, space } = await setupTest(
        t,
        "admin",
        method
      );
      const server = await RemoteMCPServerFactory.create(workspace, space);
      req.query.serverId = server.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });
});
