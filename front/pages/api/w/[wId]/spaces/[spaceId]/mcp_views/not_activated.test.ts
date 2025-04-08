import { describe, expect } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp_views/not_activated", () => {
  itInTransaction("returns MCP servers views", async (t) => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    // Create a system space
    const systemSpace = await SpaceFactory.system(workspace, t);
    req.query.spaceId = systemSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      serverViews: expect.any(Array),
    });
  });
});
