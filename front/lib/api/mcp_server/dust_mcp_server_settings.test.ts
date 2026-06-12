import {
  DEFAULT_DUST_MCP_SERVER_ALLOWED_REDIRECT_URIS,
  getDustMcpServerSettingsFromMetadata,
  validateDustMcpServerAllowedRedirectUris,
  validateDustMcpServerRedirectUri,
} from "@app/lib/api/mcp_server/dust_mcp_server_settings";
import { describe, expect, it } from "vitest";

describe("dust_mcp_server_settings", () => {
  it("returns defaults when metadata is unset", () => {
    expect(getDustMcpServerSettingsFromMetadata(undefined)).toEqual({
      disabled: false,
      acceptAllRedirectUris: true,
      allowedRedirectUris: [...DEFAULT_DUST_MCP_SERVER_ALLOWED_REDIRECT_URIS],
    });
  });

  it("validates redirect URIs", () => {
    expect(
      validateDustMcpServerRedirectUri(
        "https://www.cursor.com/agents/mcp/oauth/callback"
      ).isOk()
    ).toBe(true);
    expect(
      validateDustMcpServerRedirectUri(
        "cursor://anysphere.cursor-mcp/oauth/callback"
      ).isOk()
    ).toBe(true);
    expect(validateDustMcpServerRedirectUri("not-a-uri").isErr()).toBe(true);
  });

  it("rejects duplicate redirect URIs", () => {
    const result = validateDustMcpServerAllowedRedirectUris([
      "http://localhost:*",
      "http://localhost:*",
    ]);

    expect(result.isErr()).toBe(true);
  });
});
