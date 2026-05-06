import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/programmatic_usage/tracking", () => ({
  isProgrammaticUsage: () => false,
  checkProgrammaticUsageLimits: vi.fn(),
}));

import handler from "./index";

describe("POST /api/v1/w/[wId]/assistant/conversations", () => {
  it("returns 401 when an API key (no user) sends selectedMCPServerViewIds", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.url = `/api/v1/w/${workspace.sId}/assistant/conversations`;
    req.body = {
      title: "Test conversation",
      message: {
        content: "Hello",
        mentions: [],
        context: {
          username: "tester",
          timezone: "Europe/Paris",
          origin: "api",
          selectedMCPServerViewIds: ["msv_abcdef123456"],
        },
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Selecting MCP server views is only available to authenticated users.",
      },
    });
  });

  it("returns 401 when an API key (no user) sends clientSideMCPServerIds", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.url = `/api/v1/w/${workspace.sId}/assistant/conversations`;
    req.body = {
      title: "Test conversation",
      message: {
        content: "Hello",
        mentions: [],
        context: {
          username: "tester",
          timezone: "Europe/Paris",
          origin: "api",
          clientSideMCPServerIds: ["mcp_local_abc"],
        },
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Local MCP servers are only available to authenticated users.",
      },
    });
  });

  it("returns 400 when the request body fails schema validation", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.url = `/api/v1/w/${workspace.sId}/assistant/conversations`;
    req.body = { message: { content: "missing mentions and context" } };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 405 for unsupported methods", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "PATCH",
    });
    req.url = `/api/v1/w/${workspace.sId}/assistant/conversations`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
