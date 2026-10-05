import { HttpsProxyAgent } from "https-proxy-agent";
import { describe, expect, it } from "vitest";

import {
  getStaticIpProxyAgent,
  getStaticIpProxyUrl,
  isGoogleOAuthTokenUri,
  pinGoogleOAuthTokenUri,
  withBigQueryStaticIpProxy,
} from "./bigquery_proxy";

describe("getStaticIpProxyUrl", () => {
  it("returns undefined when any PROXY_* env var is missing", () => {
    const original = snapshotProxyEnv();

    try {
      delete process.env.PROXY_HOST;
      delete process.env.PROXY_PORT;
      delete process.env.PROXY_USER_NAME;
      delete process.env.PROXY_USER_PASSWORD;
      expect(getStaticIpProxyUrl()).toBeUndefined();
      expect(getStaticIpProxyAgent()).toBeUndefined();

      process.env.PROXY_HOST = "proxy.example.com";
      process.env.PROXY_PORT = "8080";
      process.env.PROXY_USER_NAME = "user";
      // password still missing
      expect(getStaticIpProxyUrl()).toBeUndefined();
      expect(getStaticIpProxyAgent()).toBeUndefined();
    } finally {
      restoreEnv(original);
    }
  });

  it("builds an authenticated proxy URL when all env vars are set", () => {
    const original = snapshotProxyEnv();

    try {
      process.env.PROXY_HOST = "proxy.example.com";
      process.env.PROXY_PORT = "8080";
      process.env.PROXY_USER_NAME = "user";
      process.env.PROXY_USER_PASSWORD = "pass";
      expect(getStaticIpProxyUrl()).toBe(
        "http://user:pass@proxy.example.com:8080"
      );
      expect(getStaticIpProxyAgent()).toBeInstanceOf(HttpsProxyAgent);
    } finally {
      restoreEnv(original);
    }
  });
});

describe("withBigQueryStaticIpProxy", () => {
  it("adds a request interceptor and auth transporter agent when configured", () => {
    const original = snapshotProxyEnv();

    try {
      process.env.PROXY_HOST = "proxy.example.com";
      process.env.PROXY_PORT = "8080";
      process.env.PROXY_USER_NAME = "user";
      process.env.PROXY_USER_PASSWORD = "pass";

      const options = withBigQueryStaticIpProxy({
        projectId: "proj",
      });

      expect(options.interceptors_).toHaveLength(1);
      const intercepted = options.interceptors_![0]!.request({
        uri: "https://bigquery.googleapis.com/",
      });
      expect(intercepted.proxy).toBe("http://user:pass@proxy.example.com:8080");
      expect(options.clientOptions?.transporterOptions?.agent).toBeInstanceOf(
        HttpsProxyAgent
      );
    } finally {
      restoreEnv(original);
    }
  });

  it("leaves options unchanged when proxy env is unset", () => {
    const original = snapshotProxyEnv();

    try {
      delete process.env.PROXY_HOST;
      delete process.env.PROXY_PORT;
      delete process.env.PROXY_USER_NAME;
      delete process.env.PROXY_USER_PASSWORD;

      const options = withBigQueryStaticIpProxy({ projectId: "proj" });
      expect(options.interceptors_).toBeUndefined();
      expect(options.clientOptions).toBeUndefined();
      expect(options.projectId).toBe("proj");
    } finally {
      restoreEnv(original);
    }
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
    expect(() => pinGoogleOAuthTokenUri("https://evil.example/token")).toThrow(
      /Google OAuth token endpoint/
    );
  });
});

function snapshotProxyEnv() {
  return {
    PROXY_HOST: process.env.PROXY_HOST,
    PROXY_PORT: process.env.PROXY_PORT,
    PROXY_USER_NAME: process.env.PROXY_USER_NAME,
    PROXY_USER_PASSWORD: process.env.PROXY_USER_PASSWORD,
  };
}

function restoreEnv(original: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
