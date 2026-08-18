import config from "@app/lib/api/config";
import { afterEach, describe, expect, it } from "vitest";

const PUBLIC_URL = "https://eu.dust.tt";
const INTERNAL_URL = "http://front-internal-service";

describe("getSandboxApiBaseUrl", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
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
    process.env.NODE_ENV = "production";
    process.env.SBX_DEV_FRONT_URL = "https://tunnel.example.com";

    expect(config.getSandboxApiBaseUrl()).toBe(PUBLIC_URL);
  });
});
