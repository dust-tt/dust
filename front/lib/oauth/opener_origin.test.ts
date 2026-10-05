import config from "@app/lib/api/config";
import {
  connectionPayloadForOpener,
  isTrustedDustOpenerOrigin,
  resolveOAuthPostMessageTargetOrigin,
} from "@app/lib/oauth/opener_origin";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("isTrustedDustOpenerOrigin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "https://app.dust.tt",
    "https://dust.tt",
    "https://eu.dust.tt",
    "https://front-edge.dust.tt",
    "https://eu.front-edge.dust.tt",
    "https://front-ext.dust.tt",
    "https://pr-123.preview.dust.tt",
  ])("accepts trusted Dust origin %s", (origin) => {
    expect(isTrustedDustOpenerOrigin(origin)).toBe(true);
  });

  it.each([
    "https://attacker.example",
    "https://evil.com",
    "https://dust.tt.evil.com",
    "https://preview.dust.tt.evil.com",
    "https://app.dust.tt/path",
    "https://app.dust.tt?x=1",
    "https://user:pass@app.dust.tt",
    "https://docs.dust.tt",
    "https://make.powerautomate.com",
    "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn",
    "not-a-url",
    "",
  ])("rejects attacker-controlled or non-Dust origin %s", (origin) => {
    expect(isTrustedDustOpenerOrigin(origin)).toBe(false);
  });

  it("accepts the configured app URL origin even when not in the static list", () => {
    vi.spyOn(config, "getAppUrl").mockReturnValue(
      "https://custom-cell.dust.example"
    );
    expect(isTrustedDustOpenerOrigin("https://custom-cell.dust.example")).toBe(
      true
    );
  });
});

describe("resolveOAuthPostMessageTargetOrigin", () => {
  it("uses a trusted stored opener origin", () => {
    expect(
      resolveOAuthPostMessageTargetOrigin(
        "https://dust.tt",
        "https://app.dust.tt"
      )
    ).toBe("https://dust.tt");
  });

  it("falls back to the page origin when stored opener is attacker-controlled", () => {
    expect(
      resolveOAuthPostMessageTargetOrigin(
        "https://attacker.example",
        "https://app.dust.tt"
      )
    ).toBe("https://app.dust.tt");
  });

  it("returns null when neither stored nor fallback origin is trusted", () => {
    expect(
      resolveOAuthPostMessageTargetOrigin(
        "https://attacker.example",
        "https://also-evil.example"
      )
    ).toBeNull();
  });
});

describe("connectionPayloadForOpener", () => {
  it("keeps connection_id for the opener handshake but strips metadata", () => {
    const connection: OAuthConnectionType = {
      connection_id: "con_secret_bearer",
      created: 1,
      provider: "github",
      status: "finalized",
      related_credential_id: "cred_1",
      redirect_uri: "https://app.dust.tt/oauth/github/finalize",
      metadata: {
        opener_origin: "https://app.dust.tt",
        workspace_id: "w_victim",
        user_id: "user_victim",
        client_secret: "should-not-leak",
      },
    };

    expect(connectionPayloadForOpener(connection)).toEqual({
      connection_id: "con_secret_bearer",
      created: 1,
      provider: "github",
      status: "finalized",
      related_credential_id: "cred_1",
      metadata: {},
    });
  });
});
