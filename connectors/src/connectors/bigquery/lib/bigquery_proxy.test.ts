import { getStaticIpProxyUrl } from "@connectors/lib/proxy";
import { describe, expect, it } from "vitest";

import { withBigQueryStaticIpProxy } from "./bigquery_proxy";

describe("getStaticIpProxyUrl", () => {
  it("returns undefined when any PROXY_* env var is missing", () => {
    const original = {
      PROXY_HOST: process.env.PROXY_HOST,
      PROXY_PORT: process.env.PROXY_PORT,
      PROXY_USER_NAME: process.env.PROXY_USER_NAME,
      PROXY_USER_PASSWORD: process.env.PROXY_USER_PASSWORD,
    };

    try {
      delete process.env.PROXY_HOST;
      delete process.env.PROXY_PORT;
      delete process.env.PROXY_USER_NAME;
      delete process.env.PROXY_USER_PASSWORD;
      expect(getStaticIpProxyUrl()).toBeUndefined();

      process.env.PROXY_HOST = "proxy.example.com";
      process.env.PROXY_PORT = "8080";
      process.env.PROXY_USER_NAME = "user";
      // password still missing
      expect(getStaticIpProxyUrl()).toBeUndefined();
    } finally {
      restoreEnv(original);
    }
  });

  it("builds an authenticated proxy URL when all env vars are set", () => {
    const original = {
      PROXY_HOST: process.env.PROXY_HOST,
      PROXY_PORT: process.env.PROXY_PORT,
      PROXY_USER_NAME: process.env.PROXY_USER_NAME,
      PROXY_USER_PASSWORD: process.env.PROXY_USER_PASSWORD,
    };

    try {
      process.env.PROXY_HOST = "proxy.example.com";
      process.env.PROXY_PORT = "8080";
      process.env.PROXY_USER_NAME = "user";
      process.env.PROXY_USER_PASSWORD = "pass";
      expect(getStaticIpProxyUrl()).toBe(
        "http://user:pass@proxy.example.com:8080"
      );
    } finally {
      restoreEnv(original);
    }
  });
});

describe("withBigQueryStaticIpProxy", () => {
  it("adds a request interceptor that sets proxy when configured", () => {
    const original = {
      PROXY_HOST: process.env.PROXY_HOST,
      PROXY_PORT: process.env.PROXY_PORT,
      PROXY_USER_NAME: process.env.PROXY_USER_NAME,
      PROXY_USER_PASSWORD: process.env.PROXY_USER_PASSWORD,
    };

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
    } finally {
      restoreEnv(original);
    }
  });

  it("leaves options unchanged when proxy env is unset", () => {
    const original = {
      PROXY_HOST: process.env.PROXY_HOST,
      PROXY_PORT: process.env.PROXY_PORT,
      PROXY_USER_NAME: process.env.PROXY_USER_NAME,
      PROXY_USER_PASSWORD: process.env.PROXY_USER_PASSWORD,
    };

    try {
      delete process.env.PROXY_HOST;
      delete process.env.PROXY_PORT;
      delete process.env.PROXY_USER_NAME;
      delete process.env.PROXY_USER_PASSWORD;

      const options = withBigQueryStaticIpProxy({ projectId: "proj" });
      expect(options.interceptors_).toBeUndefined();
      expect(options.projectId).toBe("proj");
    } finally {
      restoreEnv(original);
    }
  });
});

function restoreEnv(original: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
