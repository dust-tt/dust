import type { RequestMethod } from "node-mocks-http";
import { describe, expect, vi } from "vitest";

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

vi.mock(import("@app/lib/actions/mcp_actions"), async (importOriginal) => {
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
  itInTransaction("should return a list of servers", async (t) => {
    const { req, res, workspace, space } = await setupTest(t);

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
    async (t) => {
      const { req, res } = await setupTest(t);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = res._getJSONData();
      expect(responseData).toHaveProperty("servers");
      expect(responseData.servers).toBeInstanceOf(Array);
      expect(responseData.servers).toHaveLength(0);
    }
  );
});

describe("POST /api/w/[wId]/spaces/[spaceId]/mcp/remote", () => {
  itInTransaction("should return 400 when URL is missing", async (t) => {
    const { req, res } = await setupTest(t, "builder", "POST");

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
    async (t) => {
      const { req, res, workspace, space } = await setupTest(
        t,
        "builder",
        "POST"
      );

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
  itInTransaction("only supports GET and POST methods", async (t) => {
    for (const method of ["DELETE", "PUT", "PATCH"] as const) {
      const { req, res } = await setupTest(t, "builder", method);

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
