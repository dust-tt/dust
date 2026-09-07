import { apiConfig } from "@connectors/lib/api/config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import type { OAuthProvider } from "@connectors/types";
import { OAuthAPI } from "@connectors/types";
import { Err } from "@dust-tt/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOAuthConnectionAccessTokenWithThrow } from "./oauth";

const adminPolicyMessage = `Unknown error: Request failed for provider google_drive. Status: 400. Message {
  "error": "admin_policy_enforced",
  "error_description": "a"
}.`;

describe("getOAuthConnectionAccessTokenWithThrow", () => {
  beforeEach(() => {
    vi.spyOn(apiConfig, "getOAuthAPIConfig").mockReturnValue({
      url: "https://oauth.example.com",
      apiKey: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { name: "admin policy enforcement", message: adminPolicyMessage },
    { name: "a restricted account", message: "Account Restricted" },
  ])("classifies $name as an OAuth access error", async ({ message }) => {
    vi.spyOn(OAuthAPI.prototype, "getAccessToken").mockResolvedValueOnce(
      new Err({ code: "provider_access_token_refresh_error", message })
    );

    await expect(
      getOAuthConnectionAccessTokenWithThrow({
        logger,
        provider: "google_drive",
        connectionId: "test-connection",
      })
    ).rejects.toThrow(ExternalOAuthTokenError);
  });

  it.each([
    {
      provider: "google_drive",
      code: "provider_access_token_refresh_error",
      message: "temporarily_unavailable",
    },
    {
      provider: "microsoft",
      code: "provider_access_token_refresh_error",
      message: adminPolicyMessage,
    },
    {
      provider: "google_drive",
      code: "unexpected_network_error",
      message: adminPolicyMessage,
    },
  ] satisfies {
    provider: OAuthProvider;
    code: string;
    message: string;
  }[])("keeps unrelated $provider $code failures retryable", async ({
    provider,
    code,
    message,
  }) => {
    vi.spyOn(OAuthAPI.prototype, "getAccessToken").mockResolvedValueOnce(
      new Err({ code, message })
    );

    const token = getOAuthConnectionAccessTokenWithThrow({
      logger,
      provider,
      connectionId: "test-connection",
    });

    await expect(token).rejects.toThrow(
      `Error retrieving access token from ${provider}: code=${code} message=${message}`
    );
    await expect(token).rejects.not.toBeInstanceOf(ExternalOAuthTokenError);
  });
});
