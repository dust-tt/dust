import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({
  getOAuthRedirectBaseUrl: vi.fn(),
  getDevOAuthRedirectBaseUrl: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({ default: config }));

describe("finalizeUriForProvider", () => {
  beforeEach(() => {
    config.getOAuthRedirectBaseUrl.mockReturnValue("https://app.dust.tt");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("builds the finalize URI on the OAuth redirect base", () => {
    expect(finalizeUriForProvider("google_drive")).toBe(
      "https://app.dust.tt/oauth/google_drive/finalize"
    );
  });

  it("prefers the development base URL in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue("https://dev.example");
    expect(finalizeUriForProvider("notion")).toBe(
      "https://dev.example/oauth/notion/finalize"
    );
  });

  it("does not use the development base URL outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    config.getDevOAuthRedirectBaseUrl.mockReturnValue("https://dev.example");
    expect(finalizeUriForProvider("notion")).toBe(
      "https://app.dust.tt/oauth/notion/finalize"
    );
  });
});
