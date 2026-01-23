import { describe, expect, it } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./index";

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp_views", () => {
  it("returns MCP servers views", async () => {
    const { req, res, systemSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    req.query.spaceId = systemSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      serverViews: expect.any(Array),
    });
  });
});
