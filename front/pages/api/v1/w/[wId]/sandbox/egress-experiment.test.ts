import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./egress-experiment";

describe("POST /api/v1/w/[wId]/sandbox/egress-experiment", () => {
  it("echoes the X-Dust-Experiment header value back", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: { "x-dust-experiment": "__SUCCESSFULLY_REPLACED__" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      received: "__SUCCESSFULLY_REPLACED__",
    });
  });

  it("returns null when the experiment header is absent", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ received: null });
  });

  it("rejects unsupported methods", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "DELETE",
      query: { wId: "wks-test" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
