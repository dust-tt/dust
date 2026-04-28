import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./call_tool";

describe("POST /api/v1/w/[wId]/spaces/[spaceId]/mcp_server_views/[svId]/call_tool", () => {
  it("returns 403 when dsbx tools are not enabled", async () => {
    const { globalSpace, token, workspace } =
      await createSandboxTokenTestContext({
        enableSandboxTools: true,
      });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: {
        wId: workspace.sId,
        spaceId: globalSpace.sId,
        svId: "missing-view",
      },
      headers: { authorization: `Bearer ${token}` },
      body: { toolName: "search", arguments: {} },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Sandbox dsbx tools are not enabled for this workspace.",
      },
    });
  });

  it("passes the flag gate when both sandbox flags are enabled", async () => {
    const { globalSpace, token, workspace } =
      await createSandboxTokenTestContext({
        enableSandboxTools: true,
        enableDsbxTools: true,
      });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: {
        wId: workspace.sId,
        spaceId: globalSpace.sId,
        svId: "missing-view",
      },
      headers: { authorization: `Bearer ${token}` },
      body: { toolName: "search", arguments: {} },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found.",
      },
    });
  });
});
