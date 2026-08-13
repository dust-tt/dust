import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isInClusterMCPUrlAllowed } from "./in_cluster";

const ALLOWED_HOSTS = ["some-service.some-namespace.svc.cluster.local"];
const ALLOWED_URL = "http://some-service.some-namespace.svc.cluster.local/mcp";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getInClusterMCPHosts: () => ALLOWED_HOSTS,
  },
}));

vi.mock("@app/lib/auth", () => ({
  hasFeatureFlag: vi.fn(),
}));

const auth = {} as Authenticator;

function setFlag(enabled: boolean) {
  vi.mocked(hasFeatureFlag).mockResolvedValue(enabled);
}

describe("isInClusterMCPUrlAllowed", () => {
  beforeEach(() => {
    setFlag(true);
  });

  it("allows an allowlisted host when the workspace is flagged", async () => {
    await expect(isInClusterMCPUrlAllowed(auth, ALLOWED_URL)).resolves.toBe(
      true
    );
  });

  it("rejects an allowlisted host when the workspace is not flagged", async () => {
    setFlag(false);
    await expect(isInClusterMCPUrlAllowed(auth, ALLOWED_URL)).resolves.toBe(
      false
    );
  });

  it("matches regardless of scheme or case", async () => {
    await expect(
      isInClusterMCPUrlAllowed(
        auth,
        "https://Some-Service.Some-Namespace.svc.cluster.local/mcp"
      )
    ).resolves.toBe(true);
  });

  it("rejects a host that merely ends with an allowlisted suffix", async () => {
    await expect(
      isInClusterMCPUrlAllowed(
        auth,
        "http://evil.some-service.some-namespace.svc.cluster.local/mcp"
      )
    ).resolves.toBe(false);
    await expect(
      isInClusterMCPUrlAllowed(
        auth,
        "http://not-some-service.some-namespace.svc.cluster.local"
      )
    ).resolves.toBe(false);
  });

  it("rejects other in-cluster services", async () => {
    await expect(
      isInClusterMCPUrlAllowed(
        auth,
        "http://kubernetes.default.svc.cluster.local"
      )
    ).resolves.toBe(false);
    await expect(
      isInClusterMCPUrlAllowed(auth, "http://169.254.169.254/latest/meta-data")
    ).resolves.toBe(false);
    await expect(
      isInClusterMCPUrlAllowed(auth, "http://127.0.0.1:1111/mcp")
    ).resolves.toBe(false);
  });

  it("rejects an allowlisted host on an unlisted port", async () => {
    await expect(
      isInClusterMCPUrlAllowed(
        auth,
        "http://some-service.some-namespace.svc.cluster.local:9000/mcp"
      )
    ).resolves.toBe(false);
  });

  it("rejects an unparseable url", async () => {
    await expect(
      isInClusterMCPUrlAllowed(
        auth,
        "some-service.some-namespace.svc.cluster.local"
      )
    ).resolves.toBe(false);
  });

  it("evaluates the flag before looking at the url at all", async () => {
    setFlag(false);
    const getInClusterMCPHosts = vi.spyOn(config, "getInClusterMCPHosts");

    await expect(isInClusterMCPUrlAllowed(auth, ALLOWED_URL)).resolves.toBe(
      false
    );
    expect(getInClusterMCPHosts).not.toHaveBeenCalled();
  });
});
