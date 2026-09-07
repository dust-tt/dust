import config from "@app/lib/api/config";
import { afterEach, describe, expect, it, vi } from "vitest";

const PUBLIC_URL = "https://eu.dust.tt";
const INTERNAL_URL = "http://front-internal-service";

describe("getSandboxApiBaseUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("returns the public URL where the internal one would be used", () => {
    // Sandboxes run outside the cluster, so the internal service address that
    // the rest of Front prefers is unreachable for them.
    process.env.NEXT_PUBLIC_DUST_API_URL = PUBLIC_URL;
    process.env.DUST_INTERNAL_API_URL = INTERNAL_URL;

    expect(config.getApiBaseUrl()).toBe(INTERNAL_URL);
    expect(config.getSandboxApiBaseUrl()).toBe(PUBLIC_URL);
  });

  it("follows the public URL of the region it runs in", () => {
    process.env.NEXT_PUBLIC_DUST_API_URL = PUBLIC_URL;
    delete process.env.DUST_INTERNAL_API_URL;

    expect(config.getSandboxApiBaseUrl()).toBe(PUBLIC_URL);
  });

  it("uses the development host when one is set", () => {
    process.env.NEXT_PUBLIC_DUST_API_URL = PUBLIC_URL;
    process.env.IS_DEVELOPMENT = "true";
    process.env.SBX_DEV_FRONT_URL = "https://tunnel.example.com";

    expect(config.getSandboxApiBaseUrl()).toBe("https://tunnel.example.com");
  });

  it("ignores the development host outside development", () => {
    process.env.NEXT_PUBLIC_DUST_API_URL = PUBLIC_URL;
    delete process.env.IS_DEVELOPMENT;
    // Node's types mark NODE_ENV read-only, so stub it instead of assigning.
    vi.stubEnv("NODE_ENV", "production");
    process.env.SBX_DEV_FRONT_URL = "https://tunnel.example.com";

    expect(config.getSandboxApiBaseUrl()).toBe(PUBLIC_URL);
  });
});

describe("getOAuthRedirectBaseUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("points OAuth providers at the app, where the SPA serves the finalize page", () => {
    process.env.NEXT_PUBLIC_DUST_APP_URL = "https://app.dust.tt";
    process.env.NEXT_PUBLIC_DUST_API_URL = PUBLIC_URL;
    delete process.env.DUST_OAUTH_REDIRECT_BASE_URL;

    expect(config.getOAuthRedirectBaseUrl()).toBe("https://app.dust.tt");
  });

  it("honours an explicit override", () => {
    process.env.NEXT_PUBLIC_DUST_APP_URL = "https://app.dust.tt";
    process.env.DUST_OAUTH_REDIRECT_BASE_URL = "https://oauth.example.com";

    expect(config.getOAuthRedirectBaseUrl()).toBe("https://oauth.example.com");
  });
});
