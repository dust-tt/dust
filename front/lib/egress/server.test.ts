import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetch,
  mockGetUntrustedEgressProxyHost,
  mockGetUntrustedEgressProxyPort,
  mockProxyAgent,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetUntrustedEgressProxyHost: vi.fn(),
  mockGetUntrustedEgressProxyPort: vi.fn(),
  mockProxyAgent: vi.fn(function ProxyAgent(this: unknown, url: string) {
    return { proxyUrl: url };
  }),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getUntrustedEgressProxyHost: mockGetUntrustedEgressProxyHost,
    getUntrustedEgressProxyPort: mockGetUntrustedEgressProxyPort,
  },
}));

vi.mock("undici", () => ({
  ProxyAgent: mockProxyAgent,
  fetch: mockFetch,
}));

import {
  createRequiredUntrustedProxyFetch,
  getRequiredUntrustedEgressAgent,
  UntrustedEgressProxyRequiredError,
} from "@app/lib/egress/server";

describe("required untrusted egress helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed when the untrusted egress proxy is missing", () => {
    mockGetUntrustedEgressProxyHost.mockReturnValue(undefined);
    mockGetUntrustedEgressProxyPort.mockReturnValue(undefined);

    expect(() => getRequiredUntrustedEgressAgent("remote metadata")).toThrow(
      UntrustedEgressProxyRequiredError
    );
  });

  it("builds metadata fetches on the required proxy dispatcher", async () => {
    mockGetUntrustedEgressProxyHost.mockReturnValue("proxy.local");
    mockGetUntrustedEgressProxyPort.mockReturnValue("3128");
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const fetch = createRequiredUntrustedProxyFetch("remote metadata");
    await fetch("https://mcp.example.com/.well-known/oauth", {
      headers: { Authorization: "Bearer token" },
    });

    expect(mockProxyAgent).toHaveBeenCalledWith("http://proxy.local:3128");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mcp.example.com/.well-known/oauth",
      expect.objectContaining({
        dispatcher: { proxyUrl: "http://proxy.local:3128" },
        headers: { Authorization: "Bearer token" },
      })
    );
  });
});
