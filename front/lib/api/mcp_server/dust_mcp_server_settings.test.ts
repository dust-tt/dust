import {
  areRedirectUrisAllowed,
  DEFAULT_DUST_MCP_SERVER_ALLOWED_REDIRECT_URIS,
  getDustMcpServerSettingsFromMetadata,
  isRedirectUriAllowed,
  redirectUriMatchesAllowedPattern,
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

  describe("redirectUriMatchesAllowedPattern", () => {
    it("matches the global wildcard", () => {
      expect(
        redirectUriMatchesAllowedPattern("https://example.com/callback", "*")
      ).toBe(true);
    });

    it("matches port wildcards with or without an explicit port", () => {
      expect(
        redirectUriMatchesAllowedPattern(
          "http://localhost:8080/oauth/callback",
          "http://localhost:*"
        )
      ).toBe(true);
      expect(
        redirectUriMatchesAllowedPattern(
          "http://localhost/oauth/callback",
          "http://localhost:*"
        )
      ).toBe(true);
      expect(
        redirectUriMatchesAllowedPattern(
          "http://127.0.0.1:3000/",
          "http://127.0.0.1:*"
        )
      ).toBe(true);
    });

    it("matches exact redirect URIs", () => {
      expect(
        redirectUriMatchesAllowedPattern(
          "cursor://anysphere.cursor-mcp/oauth/callback",
          "cursor://anysphere.cursor-mcp/oauth/callback"
        )
      ).toBe(true);
      expect(
        redirectUriMatchesAllowedPattern(
          "https://www.cursor.com/agents/mcp/oauth/callback",
          "https://www.cursor.com/agents/mcp/oauth/callback"
        )
      ).toBe(true);
    });

    it("rejects non-matching redirect URIs", () => {
      expect(
        redirectUriMatchesAllowedPattern(
          "http://evil.example.com/callback",
          "http://localhost:*"
        )
      ).toBe(false);
      expect(
        redirectUriMatchesAllowedPattern(
          "https://example.com/callback",
          "http://localhost:*"
        )
      ).toBe(false);
    });
  });

  describe("areRedirectUrisAllowed", () => {
    it("requires every redirect URI to match at least one pattern", () => {
      const allowedPatterns = ["http://localhost:*", "*"];

      expect(
        areRedirectUrisAllowed(
          ["http://localhost:8080/callback", "https://example.com/callback"],
          allowedPatterns
        )
      ).toBe(true);
      expect(
        isRedirectUriAllowed("http://localhost/callback", allowedPatterns)
      ).toBe(true);
      expect(
        areRedirectUrisAllowed(
          ["http://localhost/callback", "http://evil.example.com/callback"],
          ["http://localhost:*"]
        )
      ).toBe(false);
    });
  });
});
