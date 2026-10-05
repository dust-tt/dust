import {
  GithubOAuthProvider,
  githubAppFinalizeCode,
} from "@app/lib/api/oauth/providers/github";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getAppUrl: () => "https://dust.tt",
    getOAuthGithubApp: () => "dust-github",
    getOAuthGithubAppPlatformActions: () => "dust-github-platform",
    getOAuthGithubAppPersonalActions: () => "personal-client-id",
    getOAuthGithubAppWebhooks: () => "webhooks-client-id",
  },
}));

describe("GithubOAuthProvider", () => {
  const provider = new GithubOAuthProvider();

  it("rejects GitHub App callbacks that only supply installation_id", () => {
    const query = {
      installation_id: "12345",
      setup_action: "install",
      state: "con_abc",
    };

    expect(provider.isCallbackQueryValid(query)).toBe(false);
    expect(provider.codeFromQuery(query)).toBeNull();
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
  });
});
