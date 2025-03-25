import { describe, expect, vi } from "vitest";

import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./sync";

vi.mock(import("@app/lib/api/mcp"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    fetchServerMetadata: vi.fn().mockResolvedValue({
      name: "Updated Server Name",
      description: "Updated server description",
      tools: [
        { name: "updated-tool", description: "Updated tool description" },
      ],
    }),
  };
});

describe("POST /api/w/[wId]/spaces/[spaceId]/mcp/remote/[serverId]/sync", () => {
  itInTransaction("should return 404 when server doesn't exist", async (db) => {
    const { req, res } = await RemoteMCPServerFactory.setupTest(
      db,
      "builder",
      "POST"
    );
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

  itInTransaction(
    "should return 403 when user is not a builder",
    async (db) => {
      const { req, res, workspace, space } =
        await RemoteMCPServerFactory.setupTest(db, "user", "POST");
      const server = await RemoteMCPServerFactory.create(workspace, space);
      req.query.serverId = server.sId;

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

  itInTransaction("only POST method is supported", async (db) => {
    for (const method of ["GET", "DELETE", "PUT", "PATCH"] as const) {
      const { req, res, workspace, space } =
        await RemoteMCPServerFactory.setupTest(db, "builder", method);
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
