import type { GongClient } from "@app/lib/api/actions/servers/gong/client";
import { getGongClient } from "@app/lib/api/actions/servers/gong/client";
import { untrustedFetch } from "@app/lib/egress/server";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { Response } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: vi.fn(),
}));

function makeAuthInfo(apiBaseUrl?: string): AuthInfo {
  return {
    token: "gong-access-token",
    clientId: "",
    scopes: [],
    extra: apiBaseUrl ? { api_base_url_for_customer: apiBaseUrl } : undefined,
  };
}

function getClient(apiBaseUrl?: string): GongClient {
  const result = getGongClient(makeAuthInfo(apiBaseUrl));
  expect(result.isOk()).toBe(true);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

describe("GongClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the customer-specific Gong API base URL", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({ calls: [], records: { totalRecords: 0 } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const client = getClient("https://eu-2086.api.gong.io");
    const result = await client.listCalls({});

    expect(result.isOk()).toBe(true);
    expect(untrustedFetch).toHaveBeenCalledWith(
      "https://eu-2086.api.gong.io/v2/calls?",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("uses the global Gong API base URL for legacy connections", async () => {
    vi.mocked(untrustedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({ calls: [], records: { totalRecords: 0 } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const client = getClient();
    const result = await client.listCalls({});

    expect(result.isOk()).toBe(true);
    expect(untrustedFetch).toHaveBeenCalledWith(
      "https://api.gong.io/v2/calls?",
      expect.objectContaining({ method: "GET" })
    );
  });
});
