import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { RequestMethod } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeregisterMCPServer } = vi.hoisted(() => ({
  mockDeregisterMCPServer: vi.fn(),
}));

vi.mock("@app/lib/api/actions/mcp/client_side_registry", () => ({
  deregisterMCPServer: mockDeregisterMCPServer,
}));

import handler from "./deregister";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "POST"
) {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    role,
    method,
  });

  req.query.wId = workspace.sId;

  return { req, res, workspace };
}

describe("POST /api/w/[wId]/mcp/deregister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeregisterMCPServer.mockResolvedValue(undefined);
  });

  it("should deregister a server successfully", async () => {
    const { req, res } = await setupTest("admin", "POST");

    const serverId = "test-server-id-123";
    req.body = { serverId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
    expect(mockDeregisterMCPServer).toHaveBeenCalledWith(expect.anything(), {
      serverId,
    });
  });

  it("should return 400 when serverId is missing", async () => {
    const { req, res } = await setupTest("admin", "POST");

    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: expect.stringContaining("Invalid request body"),
      },
    });
    expect(mockDeregisterMCPServer).not.toHaveBeenCalled();
  });

  it("should return 400 when serverId is not a string", async () => {
    const { req, res } = await setupTest("admin", "POST");

    req.body = { serverId: 123 };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
    expect(res._getJSONData().error.message).toContain("Invalid request body");
    expect(mockDeregisterMCPServer).not.toHaveBeenCalled();
  });

  it("should return 405 for non-POST methods", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"] as const) {
      const { req, res } = await setupTest("admin", method);

      req.body = { serverId: "test-server-id" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "Method not allowed.",
        },
      });
      expect(mockDeregisterMCPServer).not.toHaveBeenCalled();
    }
  });
});
