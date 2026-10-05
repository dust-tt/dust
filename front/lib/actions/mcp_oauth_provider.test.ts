import {
  MCPOAuthProvider,
  MCPOAuthProviderError,
  resolveMCPAuthFailure,
} from "@app/lib/actions/mcp_oauth_provider";
import config from "@app/lib/api/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, assert, describe, expect, it, vi } from "vitest";

describe("remote MCP OAuth client registration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["https://dust.tt", "https://eu.dust.tt"])(
    "registers the same legacy callback used for authorization in %s",
    (legacyBaseUrl) => {
      vi.spyOn(config, "getLegacyOAuthRedirectBaseUrl").mockReturnValue(
        legacyBaseUrl
      );
      vi.spyOn(config, "getAppUrl").mockReturnValue("https://app.dust.tt");
      vi.spyOn(config, "getStaticWebsiteUrl").mockReturnValue(
        "https://dust.tt"
      );
      vi.spyOn(config, "getDevOAuthRedirectBaseUrl").mockReturnValue(undefined);

      const provider = new MCPOAuthProvider();
      const redirectUri = `${legacyBaseUrl}/oauth/mcp/finalize`;

      expect(provider.redirectUrl).toBe(redirectUri);
      expect(provider.clientMetadata.redirect_uris).toEqual([redirectUri]);
    }
  );
});

const SERVER_URL = "https://mcp.example.com/mcp";
const READ_SCOPE = "data.records:read";
const WRITE_SCOPE = "schema.bases:write";

const fakeServerRejectingToolCallsWith403: FetchLike = async (url, init) => {
  if (url.toString().endsWith("/register")) {
    return Response.json({ client_id: "client", redirect_uris: [] });
  }
  if (url.toString() !== SERVER_URL || init?.method !== "POST") {
    return new Response(null, { status: 404 });
  }
  const { id, method } = JSON.parse(String(init.body));
  if (method === "initialize") {
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fake", version: "1.0.0" },
      },
    });
  }
  if (method === "tools/call") {
    return new Response(null, {
      status: 403,
      headers: {
        "WWW-Authenticate": `Bearer error="insufficient_scope", scope="${WRITE_SCOPE}"`,
      },
    });
  }
  return new Response(null, { status: 202 });
};

async function callToolWithTokenScope(
  scope: string
): Promise<MCPOAuthProviderError> {
  const authProvider = new MCPOAuthProvider({
    access_token: "token",
    token_type: "bearer",
    scope,
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(SERVER_URL), {
      authProvider,
      fetch: authProvider.wrapFetch(fakeServerRejectingToolCallsWith403),
    })
  );
  const error = await client
    .callTool({ name: "create_table", arguments: {} })
    .then(
      () => null,
      (e: unknown) => e
    );
  await client.close();
  assert(error instanceof MCPOAuthProviderError, "expected an OAuth error");
  return error;
}

describe("re-authentication after a tool call rejected with 403 insufficient_scope", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for the upscoped auth once, then refuses instead of asking again", async () => {
    vi.spyOn(config, "getStaticWebsiteUrl").mockReturnValue("https://dust.tt");

    const firstError = await callToolWithTokenScope(READ_SCOPE);
    expect(firstError.challenge).toMatchObject({
      status: 403,
      error: "insufficient_scope",
      scope: WRITE_SCOPE,
    });
    const first = resolveMCPAuthFailure(firstError, READ_SCOPE);
    assert(first.kind === "reauthenticate", "expected a re-auth prompt");
    expect(first.scope).toBe(`${READ_SCOPE} ${WRITE_SCOPE}`);

    const secondError = await callToolWithTokenScope(first.scope ?? "");
    expect(resolveMCPAuthFailure(secondError, READ_SCOPE)).toEqual({
      kind: "refused",
    });
  });

  it("keeps re-authenticating with the configured scope on a 401", () => {
    const error = new MCPOAuthProviderError("saveCodeVerifier", {
      status: 401,
      wwwAuthenticate: "Bearer",
    });
    expect(resolveMCPAuthFailure(error, READ_SCOPE)).toEqual({
      kind: "reauthenticate",
      scope: READ_SCOPE,
    });
  });
});
