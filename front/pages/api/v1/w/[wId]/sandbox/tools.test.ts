import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./tools";

describe("GET /api/v1/w/[wId]/sandbox/tools", () => {
  it("returns 403 when dsbx tools are not enabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext({
      enableSandboxTools: true,
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { wId: workspace.sId },
      headers: { authorization: `Bearer ${token}` },
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

  it("returns server views when both sandbox flags are enabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext({
      enableSandboxTools: true,
      enableDsbxTools: true,
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { wId: workspace.sId },
      headers: { authorization: `Bearer ${token}` },
    });

    await handler(req, res);

    expect(res._getJSONData()).toEqual({ serverViews: [] });
    expect(res._getStatusCode()).toBe(200);
  });
});
