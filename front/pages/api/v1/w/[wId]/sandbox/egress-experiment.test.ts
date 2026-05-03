import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetEgressMitmExperimentHost, mockGetEgressMitmExperimentToken } =
  vi.hoisted(() => ({
    mockGetEgressMitmExperimentHost: vi.fn(),
    mockGetEgressMitmExperimentToken: vi.fn(),
  }));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getEgressMitmExperimentHost: mockGetEgressMitmExperimentHost,
    getEgressMitmExperimentToken: mockGetEgressMitmExperimentToken,
  },
}));

const { mockLoggerInfo } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
}));
vi.mock("@app/logger/logger", () => ({
  default: {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import handler from "./egress-experiment";

const TOKEN = "test-experiment-token";

describe("POST /api/v1/w/[wId]/sandbox/egress-experiment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEgressMitmExperimentHost.mockReturnValue("dust.example.com");
    mockGetEgressMitmExperimentToken.mockReturnValue(TOKEN);
  });

  it("echoes the X-Dust-Experiment header value back when enabled and token matches", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: {
        "x-dust-experiment": "echo-test-value",
        "x-dust-experiment-token": TOKEN,
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ received: "echo-test-value" });
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "sandbox.egress_experiment.hit",
        received: "echo-test-value",
      }),
      "egress experiment hit"
    );
  });

  it("returns null when the experiment header is absent", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: { "x-dust-experiment-token": TOKEN },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ received: null });
  });

  it("rejects unsupported methods", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "DELETE",
      query: { wId: "wks-test" },
      headers: { "x-dust-experiment-token": TOKEN },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 404 when EGRESS_MITM_EXPERIMENT_HOST is unset", async () => {
    mockGetEgressMitmExperimentHost.mockReturnValue(undefined);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: { "x-dust-experiment-token": TOKEN },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 404 when EGRESS_MITM_EXPERIMENT_TOKEN is unset", async () => {
    mockGetEgressMitmExperimentToken.mockReturnValue(undefined);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: { "x-dust-experiment-token": TOKEN },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 401 when the token is missing", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: { "x-dust-experiment": "echo-test-value" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 401 when the token does not match", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { wId: "wks-test" },
      headers: {
        "x-dust-experiment": "echo-test-value",
        "x-dust-experiment-token": "wrong-token",
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });
});
