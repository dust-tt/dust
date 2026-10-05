import { EnvironmentConfig } from "@app/types/shared/utils/config";
import { HttpsProxyAgent } from "https-proxy-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isGoogleOAuthTokenUri,
  pinGoogleOAuthTokenUri,
  withBigQueryStaticIpProxy,
} from "./bigquery";

vi.mock("@app/types/shared/utils/config", () => ({
  EnvironmentConfig: {
    getOptionalEnvVariable: vi.fn(),
  },
}));

describe("withBigQueryStaticIpProxy", () => {
  beforeEach(() => {
    vi.mocked(EnvironmentConfig.getOptionalEnvVariable).mockReset();
  });

  it("adds a proxy interceptor and auth transporter agent when PROXY_* is configured", () => {
    vi.mocked(EnvironmentConfig.getOptionalEnvVariable).mockImplementation(
      (key: string) => {
        switch (key) {
          case "PROXY_HOST":
            return "proxy.example.com";
          case "PROXY_PORT":
            return "8080";
          case "PROXY_USER_NAME":
            return "user";
          case "PROXY_USER_PASSWORD":
            return "pass";
          default:
            return undefined;
        }
      }
    );

    const options = withBigQueryStaticIpProxy({ projectId: "proj" });
    expect(options.interceptors_).toHaveLength(1);
    const intercepted = options.interceptors_![0]!.request({
      uri: "https://bigquery.googleapis.com/",
    });
    expect(intercepted.proxy).toBe("http://user:pass@proxy.example.com:8080");

    expect(options.clientOptions?.transporterOptions?.agent).toBeInstanceOf(
      HttpsProxyAgent
    );
  });

  it("leaves options unchanged when PROXY_* is unset", () => {
    vi.mocked(EnvironmentConfig.getOptionalEnvVariable).mockReturnValue(
      undefined
    );

    const options = withBigQueryStaticIpProxy({ projectId: "proj" });
    expect(options.interceptors_).toBeUndefined();
    expect(options.clientOptions).toBeUndefined();
    expect(options.projectId).toBe("proj");
  });

  it("preserves existing clientOptions when adding the proxy agent", () => {
    vi.mocked(EnvironmentConfig.getOptionalEnvVariable).mockImplementation(
      (key: string) => {
        switch (key) {
          case "PROXY_HOST":
            return "proxy.example.com";
          case "PROXY_PORT":
            return "8080";
          case "PROXY_USER_NAME":
            return "user";
          case "PROXY_USER_PASSWORD":
            return "pass";
          default:
            return undefined;
        }
      }
    );

    const options = withBigQueryStaticIpProxy({
      projectId: "proj",
      clientOptions: {
        eagerRefreshThresholdMillis: 1234,
        transporterOptions: {
          timeout: 5000,
        },
      },
    });

    expect(options.clientOptions?.eagerRefreshThresholdMillis).toBe(1234);
    expect(options.clientOptions?.transporterOptions?.timeout).toBe(5000);
    expect(options.clientOptions?.transporterOptions?.agent).toBeInstanceOf(
      HttpsProxyAgent
    );
  });
});

describe("pinGoogleOAuthTokenUri", () => {
  it("accepts Google canonical token endpoints", () => {
    expect(isGoogleOAuthTokenUri("https://oauth2.googleapis.com/token")).toBe(
      true
    );
    expect(
      isGoogleOAuthTokenUri("https://www.googleapis.com/oauth2/v4/token")
    ).toBe(true);
    expect(pinGoogleOAuthTokenUri("https://oauth2.googleapis.com/token")).toBe(
      "https://oauth2.googleapis.com/token"
    );
  });

  it("rejects arbitrary token endpoints so proxied exchange cannot be redirected", () => {
    expect(isGoogleOAuthTokenUri("https://evil.example/token")).toBe(false);
    expect(() => pinGoogleOAuthTokenUri("https://evil.example/token")).toThrow(
      /Google OAuth token endpoint/
    );
    expect(
      isGoogleOAuthTokenUri("https://oauth2.googleapis.com.evil.example/token")
    ).toBe(false);
  });
});
