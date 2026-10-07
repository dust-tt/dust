import {
  buildPostHogDownstreamHeaders,
  buildPostHogUpstreamHeaders,
  resolvePostHogUpstreamUrl,
} from "@marketing/lib/posthog_proxy";
import { describe, expect, it } from "vitest";

describe("resolvePostHogUpstreamUrl", () => {
  it("targets the ingestion host, preserving path and query", () => {
    expect(
      resolvePostHogUpstreamUrl(
        new URL("https://dust.tt/subtle1/e/?ip=1&_=123")
      )
    ).toBe("https://eu.i.posthog.com/e/?ip=1&_=123");
  });

  it("accepts the rewritten /api/subtle1 path", () => {
    expect(
      resolvePostHogUpstreamUrl(
        new URL("http://localhost:3004/api/subtle1/flags/?v=2")
      )
    ).toBe("https://eu.i.posthog.com/flags/?v=2");
  });

  it("targets the assets host for static files", () => {
    expect(
      resolvePostHogUpstreamUrl(
        new URL("https://dust.tt/subtle1/static/array.js")
      )
    ).toBe("https://eu-assets.i.posthog.com/static/array.js");
  });
});

describe("buildPostHogUpstreamHeaders", () => {
  it("does not forward Cookie, Authorization or non-allowlisted headers", () => {
    const headers = buildPostHogUpstreamHeaders({
      authorization: "Bearer y",
      cookie: "workos_session=x; dust-has-session=1",
      host: "dust.tt",
      "x-csrf-token": "z",
    });

    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(headers.get("x-csrf-token")).toBeNull();
  });

  it("forwards allowlisted headers", () => {
    const headers = buildPostHogUpstreamHeaders({
      "content-length": "29",
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      "x-forwarded-for": ["203.0.113.1", "198.51.100.7"],
    });

    expect(headers.get("content-length")).toBe("29");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("user-agent")).toBe("Mozilla/5.0");
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.1, 198.51.100.7");
  });
});

describe("buildPostHogDownstreamHeaders", () => {
  it("drops Set-Cookie and non-allowlisted headers, keeps caching headers", () => {
    const headers = buildPostHogDownstreamHeaders(
      new Headers({
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=86400",
        "content-type": "application/javascript",
        "set-cookie": "ph=1; Path=/",
      })
    );

    expect(headers.get("set-cookie")).toBeNull();
    expect(headers.get("access-control-allow-origin")).toBeNull();
    expect(headers.get("cache-control")).toBe("public, max-age=86400");
    expect(headers.get("content-type")).toBe("application/javascript");
  });
});
