import type { GongClient } from "@app/lib/api/actions/servers/gong/client";
import { getGongClient } from "@app/lib/api/actions/servers/gong/client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { fetch as undiciFetch, Response } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  getStaticIPProxyAgent: () => undefined,
}));

vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: vi.fn(),
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
    vi.mocked(undiciFetch).mockResolvedValue(
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
    expect(undiciFetch).toHaveBeenCalledWith(
      "https://eu-2086.api.gong.io/v2/calls?",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("uses the global Gong API base URL for legacy connections", async () => {
    vi.mocked(undiciFetch).mockResolvedValue(
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
    expect(undiciFetch).toHaveBeenCalledWith(
      "https://api.gong.io/v2/calls?",
      expect.objectContaining({ method: "GET" })
    );
  });
});
