import { EnvironmentConfig } from "@app/types/shared/utils/config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { withBigQueryStaticIpProxy } from "./bigquery";

vi.mock("@app/types/shared/utils/config", () => ({
  EnvironmentConfig: {
    getOptionalEnvVariable: vi.fn(),
  },
}));

describe("withBigQueryStaticIpProxy", () => {
  beforeEach(() => {
    vi.mocked(EnvironmentConfig.getOptionalEnvVariable).mockReset();
  });

  it("adds a proxy interceptor when PROXY_* is configured", () => {
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
  });

  it("leaves options unchanged when PROXY_* is unset", () => {
    vi.mocked(EnvironmentConfig.getOptionalEnvVariable).mockReturnValue(
      undefined
    );

    const options = withBigQueryStaticIpProxy({ projectId: "proj" });
    expect(options.interceptors_).toBeUndefined();
    expect(options.projectId).toBe("proj");
  });
});
