import { describe, expect, it } from "vitest";

import {
  isStaticIpForcedRemoteMcpUrl,
  STATIC_IP_FORCED_REMOTE_MCP_URLS,
} from "./static_ip_forced_urls";

describe("isStaticIpForcedRemoteMcpUrl", () => {
  it("matches the official BigQuery MCP URL", () => {
    expect(
      isStaticIpForcedRemoteMcpUrl("https://bigquery.googleapis.com/mcp")
    ).toBe(true);
    expect(
      isStaticIpForcedRemoteMcpUrl("https://bigquery.googleapis.com/mcp/")
    ).toBe(true);
    expect(
      isStaticIpForcedRemoteMcpUrl(
        new URL("https://BIGQUERY.googleapis.com/mcp")
      )
    ).toBe(true);
  });

  it("rejects near-miss and user-controlled URLs", () => {
    expect(
      isStaticIpForcedRemoteMcpUrl("http://bigquery.googleapis.com/mcp")
    ).toBe(false);
    expect(
      isStaticIpForcedRemoteMcpUrl("https://bigquery.googleapis.com/mcp/extra")
    ).toBe(false);
    expect(
      isStaticIpForcedRemoteMcpUrl("https://evil.bigquery.googleapis.com/mcp")
    ).toBe(false);
    expect(isStaticIpForcedRemoteMcpUrl("https://mcp.example.com/mcp")).toBe(
      false
    );
    expect(isStaticIpForcedRemoteMcpUrl("not a url")).toBe(false);
  });

  it("keeps the allowlist non-empty and HTTPS-only", () => {
    expect(STATIC_IP_FORCED_REMOTE_MCP_URLS.length).toBeGreaterThan(0);
    for (const url of STATIC_IP_FORCED_REMOTE_MCP_URLS) {
      expect(url.startsWith("https://")).toBe(true);
      expect(isStaticIpForcedRemoteMcpUrl(url)).toBe(true);
    }
  });
});
