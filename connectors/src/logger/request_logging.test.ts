import type { Request } from "express";
import { describe, expect, it } from "vitest";
import {
  formatMorganRequestLog,
  getSafeRequestHeaders,
  getSafeRequestLogContext,
  sanitizeRequestUrl,
} from "./request_logging";

const SECRET_SENTINEL = "must-never-appear-in-logs";

describe("sanitizeRequestUrl", () => {
  it.each([
    {
      url: `/webhooks/${SECRET_SENTINEL}/slack?token=${SECRET_SENTINEL}`,
      expected: "/webhooks/[REDACTED]/slack",
    },
    {
      url: `/webhooks_router_entries/${SECRET_SENTINEL}/notion/workspace?secret=${SECRET_SENTINEL}`,
      expected: "/webhooks_router_entries/[REDACTED]/notion/workspace",
    },
    {
      url: `/profiler?secret=${SECRET_SENTINEL}`,
      expected: "/profiler",
    },
    {
      url: `/webhooks/${SECRET_SENTINEL}`,
      expected: "/webhooks/[REDACTED]",
    },
  ])("removes credentials from $url", ({ url, expected }) => {
    const sanitized = sanitizeRequestUrl(url);

    expect(sanitized).toBe(expected);
    expect(sanitized).not.toContain(SECRET_SENTINEL);
  });
});

describe("getSafeRequestHeaders", () => {
  it("keeps operational headers without logging credentials", () => {
    const safeHeaders = getSafeRequestHeaders({
      authorization: `Bearer ${SECRET_SENTINEL}`,
      cookie: `session=${SECRET_SENTINEL}`,
      "content-type": "application/json",
      "user-agent": "test-agent",
      "x-dust-clientid": "webhook-router",
      "x-hub-signature-256": `sha256=${SECRET_SENTINEL}`,
      "x-signature-ed25519": SECRET_SENTINEL,
    });

    expect(safeHeaders).toEqual({
      "content-type": "application/json",
      "user-agent": "test-agent",
      "x-dust-clientid": "webhook-router",
    });
    expect(JSON.stringify(safeHeaders)).not.toContain(SECRET_SENTINEL);
  });
});

describe("request log output", () => {
  it("does not expose credentials to structured or HTTP logs", () => {
    const url = `/webhooks/${SECRET_SENTINEL}/slack?secret=${SECRET_SENTINEL}`;
    const request = {
      method: "POST",
      originalUrl: url,
      url,
      headers: {
        authorization: `Bearer ${SECRET_SENTINEL}`,
        cookie: `session=${SECRET_SENTINEL}`,
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${SECRET_SENTINEL}`,
      },
    } as unknown as Request;

    const structuredLogContext = getSafeRequestLogContext(request);
    const httpLogLine = formatMorganRequestLog({
      method: request.method,
      url: request.url,
      status: "200",
      contentLength: "0",
      responseTime: "1.5",
    });

    expect(JSON.stringify(structuredLogContext)).not.toContain(SECRET_SENTINEL);
    expect(httpLogLine).not.toContain(SECRET_SENTINEL);
    expect(httpLogLine).toContain("/webhooks/[REDACTED]/slack");
  });
});
