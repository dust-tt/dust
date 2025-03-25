import { describe, expect, vi } from "vitest";

import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
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
    const { req, res, workspace, space } =
      await RemoteMCPServerFactory.setupTest(db);

    // Create two test servers
    await RemoteMCPServerFactory.create(workspace, space, {
      name: "Test Server 1",
      url: "https://test-server-1.example.com",
      tools: [{ name: "tool-1", description: "Tool 1 description" }],
    });

    await RemoteMCPServerFactory.create(workspace, space, {
      name: "Test Server 2",
      url: "https://test-server-2.example.com",
      tools: [{ name: "tool-2", description: "Tool 2 description" }],
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("servers");
    expect(responseData.servers).toHaveLength(2);
  });

  itInTransaction(
    "should return empty array when no servers exist",
    async (db) => {
      const { req, res } = await RemoteMCPServerFactory.setupTest(db);

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
      const { req, res } = await RemoteMCPServerFactory.setupTest(db, "user");

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
    const { req, res } = await RemoteMCPServerFactory.setupTest(
      db,
      "builder",
      "POST"
    );

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
      const { req, res, workspace, space } =
        await RemoteMCPServerFactory.setupTest(db, "builder", "POST");

      const existingUrl = "https://existing-server.example.com";
      await RemoteMCPServerFactory.create(workspace, space, {
        name: "Existing Server",
        url: existingUrl,
      });

      req.body = { url: existingUrl };

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
      const { req, res } = await RemoteMCPServerFactory.setupTest(
        db,
        "builder",
        method
      );

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
