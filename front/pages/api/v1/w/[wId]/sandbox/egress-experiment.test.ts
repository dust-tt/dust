import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetEgressMitmExperimentHost } = vi.hoisted(() => ({
  mockGetEgressMitmExperimentHost: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getEgressMitmExperimentHost: mockGetEgressMitmExperimentHost,
  },
}));

import handler from "./egress-experiment";

describe("POST /api/v1/w/[wId]/sandbox/egress-experiment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEgressMitmExperimentHost.mockReturnValue("dust.example.com");
  });

  it("echoes the X-Dust-Experiment header value back when enabled", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: { "x-dust-experiment": "echo-test-value" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ received: "echo-test-value" });
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

  it("returns 404 when the experiment is not enabled", async () => {
    mockGetEgressMitmExperimentHost.mockReturnValue(undefined);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: { "x-dust-experiment": "echo-test-value" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });
});
