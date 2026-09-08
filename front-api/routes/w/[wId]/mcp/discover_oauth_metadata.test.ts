import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  registerClient,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockLookup } = vi.hoisted(() => ({ mockLookup: vi.fn() }));

vi.mock(import("node:dns/promises"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    lookup: mockLookup,
    default: { ...actual, lookup: mockLookup },
  };
});

vi.mock(
  import("@modelcontextprotocol/sdk/client/auth.js"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    discoverAuthorizationServerMetadata: vi.fn(),
    discoverOAuthProtectedResourceMetadata: vi.fn(),
    registerClient: vi.fn(),
  })
);

import { honoApp } from "@front-api/app";

describe("POST /api/w/:wId/mcp/discover_oauth_metadata", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "metadata",
    "registration",
  ] as const)("logs the upstream %s error with request context while preserving the response", async (stage) => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
      method: "POST",
    });
    const serverUrl = "https://mcp.example.com/mcp";
    const upstreamError = new ServerError(
      "No approved client matches this redirect_uri"
    );
    mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    vi.spyOn(Client.prototype, "connect").mockRejectedValue(
      new Error("OAuth required")
    );
    vi.spyOn(config, "getStaticWebsiteUrl").mockReturnValue(
      "https://dust.example.com"
    );
    vi.mocked(discoverOAuthProtectedResourceMetadata).mockResolvedValue({
      resource: serverUrl,
      authorization_servers: ["https://auth.example.com"],
    });
    vi.mocked(discoverAuthorizationServerMetadata).mockResolvedValue({
      issuer: "https://auth.example.com",
      authorization_endpoint: "https://auth.example.com/authorize",
      token_endpoint: "https://auth.example.com/token",
      registration_endpoint: "https://auth.example.com/register",
      response_types_supported: ["code"],
    });
    vi.mocked(registerClient).mockRejectedValue(upstreamError);
    if (stage === "metadata") {
      vi.mocked(discoverAuthorizationServerMetadata).mockRejectedValue(
        upstreamError
      );
    }
    const logSpy = vi.spyOn(logger, "error");
    const requestUrl = `/api/w/${workspace.sId}/mcp/discover_oauth_metadata`;

    const response = await honoApp.request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: serverUrl }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        type: "internal_server_error",
        message:
          stage === "metadata"
            ? "Failed to discover OAuth metadata"
            : "Failed to register client, this server might require a pre-approval process. Please contact support@dust.com.",
      },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: requestUrl,
        statusCode: 500,
        error: expect.objectContaining({
          message: upstreamError.message,
          stack: upstreamError.stack,
        }),
      }),
      "API Error"
    );
  });
});
