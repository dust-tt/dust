import {
  GithubOAuthProvider,
  githubAppContinueAuthorizeUriFromQuery,
  githubAppFinalizeCode,
  githubAppPendingState,
  isGithubAppInstallWithoutUserCode,
  parseGithubAppPendingState,
} from "@app/lib/api/oauth/providers/github";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getAppUrl: () => "https://dust.tt",
    getLegacyOAuthRedirectBaseUrl: () => "https://dust.tt",
    getOAuthGithubApp: () => "dust-github",
    getOAuthGithubAppClientId: () => "github-app-client-id",
    getOAuthGithubAppPlatformActions: () => "dust-github-platform",
    getOAuthGithubAppPlatformActionsClientId: () => "platform-client-id",
    getOAuthGithubAppPersonalActions: () => "personal-client-id",
    getOAuthGithubAppWebhooks: () => "webhooks-client-id",
  },
}));

function pendingConnection(
  useCase: "connection" | "platform_actions"
): OAuthConnectionType {
  return {
    connection_id: "con_abc",
    created: 1,
    provider: "github",
    status: "pending",
    metadata: { use_case: useCase },
  };
}

describe("GithubOAuthProvider", () => {
  const provider = new GithubOAuthProvider();

  it("does not treat installation_id alone as a finalize code", () => {
    const query = {
      installation_id: "12345",
      setup_action: "install",
      state: "con_abc",
    };

    expect(provider.isCallbackQueryValid(query)).toBe(false);
    expect(provider.codeFromQuery(query)).toBeNull();
    expect(isGithubAppInstallWithoutUserCode(query)).toBe(true);
  });

  it("binds App finalize to installation_id plus the user OAuth code", () => {
    const query = {
      installation_id: "12345",
      code: "user-oauth-code",
      setup_action: "install",
      state: "con_abc",
    };

    expect(provider.isCallbackQueryValid(query)).toBe(true);
    expect(provider.codeFromQuery(query)).toBe(
      "gh_app_install:12345:user-oauth-code"
    );
  });

  it("builds a continue-authorize URL for legacy installs without code", () => {
    const query = {
      installation_id: "12345",
      setup_action: "update",
      state: "con_abc",
    };
    const authorizeUrl = githubAppContinueAuthorizeUriFromQuery(
      query,
      pendingConnection("connection")
    );

    expect(authorizeUrl).toContain(
      "https://github.com/login/oauth/authorize?client_id=github-app-client-id"
    );
    expect(authorizeUrl).toContain(
      `state=${encodeURIComponent("gh_app_pending:con_abc:12345")}`
    );
  });

  it("finalizes legacy-install hop 2 from pending state plus code", () => {
    const query = {
      code: "user-oauth-code",
      state: "gh_app_pending:con_abc:12345",
    };

    expect(provider.connectionIdFromQuery(query)).toBe("con_abc");
    expect(provider.isCallbackQueryValid(query)).toBe(true);
    expect(provider.codeFromQuery(query)).toBe(
      "gh_app_install:12345:user-oauth-code"
    );
  });

  it("rejects non-numeric or zero installation ids", () => {
    expect(
      provider.codeFromQuery({
        installation_id: "../1",
        code: "user-oauth-code",
        state: "con_abc",
      })
    ).toBeNull();
    expect(
      provider.isCallbackQueryValid({
        installation_id: "0123",
        code: "user-oauth-code",
        state: "con_abc",
      })
    ).toBe(false);
    expect(githubAppFinalizeCode("0", "user-oauth-code")).toBeNull();
    expect(
      isGithubAppInstallWithoutUserCode({
        installation_id: "0123",
        state: "con_abc",
      })
    ).toBe(false);
  });

  it("still accepts user-token OAuth callbacks that only include code", () => {
    const query = { code: "user-oauth-code", state: "con_abc" };

    expect(provider.isCallbackQueryValid(query)).toBe(true);
    expect(provider.codeFromQuery(query)).toBe("user-oauth-code");
  });

  it("rejects unknown setup_action values on App callbacks", () => {
    expect(
      provider.isCallbackQueryValid({
        installation_id: "12345",
        code: "user-oauth-code",
        setup_action: "request",
        state: "con_abc",
      })
    ).toBe(false);
    expect(
      isGithubAppInstallWithoutUserCode({
        installation_id: "12345",
        setup_action: "request",
        state: "con_abc",
      })
    ).toBe(false);
  });

  it("parses and rejects malformed pending state", () => {
    expect(githubAppPendingState("con_abc", "12345")).toBe(
      "gh_app_pending:con_abc:12345"
    );
    expect(parseGithubAppPendingState("gh_app_pending:con_abc:12345")).toEqual({
      connectionId: "con_abc",
      installationId: "12345",
    });
    expect(parseGithubAppPendingState("con_abc")).toBeNull();
    expect(parseGithubAppPendingState("gh_app_pending:con_abc")).toBeNull();
  });
});
