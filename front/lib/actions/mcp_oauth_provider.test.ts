import { MCPOAuthProvider } from "@app/lib/actions/mcp_oauth_provider";
import config from "@app/lib/api/config";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("remote MCP OAuth client registration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "https://dust.tt",
    "https://eu.dust.tt",
  ])("registers the same legacy callback used for authorization in %s", (legacyBaseUrl) => {
    vi.spyOn(config, "getLegacyOAuthRedirectBaseUrl").mockReturnValue(
      legacyBaseUrl
    );
    vi.spyOn(config, "getAppUrl").mockReturnValue("https://app.dust.tt");
    vi.spyOn(config, "getStaticWebsiteUrl").mockReturnValue("https://dust.tt");
    vi.spyOn(config, "getDevOAuthRedirectBaseUrl").mockReturnValue(undefined);

    const provider = new MCPOAuthProvider();
    const redirectUri = `${legacyBaseUrl}/oauth/mcp/finalize`;

    expect(provider.redirectUrl).toBe(redirectUri);
    expect(provider.clientMetadata.redirect_uris).toEqual([redirectUri]);
  });
});
