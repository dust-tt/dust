import config from "@app/lib/api/config";
import { getMcpClientIdMetadataDocumentUrl } from "@app/lib/api/mcp_server/urls";
import { honoApp } from "@front-api/app";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /.well-known/oauth-client.json", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["https://dust.tt", "https://eu.dust.tt"])(
    "serves a CIMD whose client_id, client_uri and callback share the %s origin",
    async (legacyBaseUrl) => {
      vi.spyOn(config, "getLegacyOAuthRedirectBaseUrl").mockReturnValue(
        legacyBaseUrl
      );
      vi.spyOn(config, "getDevOAuthRedirectBaseUrl").mockReturnValue(undefined);

      const response = await honoApp.request("/.well-known/oauth-client.json");

      expect(response.status).toBe(200);
      const document = await response.json();
      expect(document.client_id).toBe(
        `${legacyBaseUrl}/.well-known/oauth-client.json`
      );
      expect(document.client_id).toBe(getMcpClientIdMetadataDocumentUrl());
      expect(document.client_uri).toBe(legacyBaseUrl);
      expect(document.redirect_uris).toEqual([
        `${legacyBaseUrl}/oauth/mcp/finalize`,
      ]);
    }
  );
});
