import { Err, Ok } from "@app/types/shared/result";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetEgressProxyHost,
  mockGetEgressProxyJwtSecret,
  mockGetEgressProxyPort,
  mockGetEgressProxyTlsName,
  mockGetSandboxDevUnrestrictedEgress,
  mockGetCurrentRegion,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLookup,
  mockWriteEgressSecretsFile,
} = vi.hoisted(() => ({
  mockGetEgressProxyHost: vi.fn(),
  mockGetEgressProxyJwtSecret: vi.fn(),
  mockGetEgressProxyPort: vi.fn(),
  mockGetEgressProxyTlsName: vi.fn(),
  mockGetSandboxDevUnrestrictedEgress: vi.fn(),
  mockGetCurrentRegion: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLookup: vi.fn(),
  mockWriteEgressSecretsFile: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getEgressProxyHost: mockGetEgressProxyHost,
    getEgressProxyJwtSecret: mockGetEgressProxyJwtSecret,
    getEgressProxyPort: mockGetEgressProxyPort,
    getEgressProxyTlsName: mockGetEgressProxyTlsName,
    getSandboxDevUnrestrictedEgress: mockGetSandboxDevUnrestrictedEgress,
  },
}));

vi.mock("@app/lib/api/regions/config", () => ({
  config: {
    getCurrentRegion: mockGetCurrentRegion,
  },
}));

vi.mock("@app/lib/api/sandbox/egress_secrets", () => ({
  EGRESS_SECRETS_PATH: "/run/dust/egress-secrets.json",
  writeEgressSecretsFile: mockWriteEgressSecretsFile,
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  },
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: mockLookup,
  },
  lookup: mockLookup,
}));

import {
  ensureSandboxEgressOnExec,
  mintEgressJwt,
  readNewDenyLogEntries,
  setupEgressForwarder,
  teardownInSandboxEgressRedirect,
} from "./egress";
import { SANDBOX_TRUST_ENV_VARS } from "./trust_env";

describe("sandbox egress helpers", () => {
  const auth = {
    getNonNullableWorkspace: () => ({ sId: "workspace-id" }),
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEgressProxyHost.mockReturnValue(undefined);
    mockGetEgressProxyJwtSecret.mockReturnValue("egress-secret");
    mockGetEgressProxyPort.mockReturnValue(4443);
    mockGetEgressProxyTlsName.mockReturnValue(undefined);
    mockGetSandboxDevUnrestrictedEgress.mockReturnValue(false);
    mockGetCurrentRegion.mockReturnValue("europe-west1");
    mockLookup.mockResolvedValue({ address: "203.0.113.10", family: 4 });
    mockWriteEgressSecretsFile.mockResolvedValue(new Ok(undefined));
  });

  it("mints a proxy JWT bound to the provider sandbox id", () => {
    const token = mintEgressJwt("provider-sandbox-id", "workspace-id");
    const payload = jwt.verify(token, "egress-secret", {
      algorithms: ["HS256"],
      audience: "dust-egress-proxy",
      issuer: "dust-front",
    }) as jwt.JwtPayload;

    expect(payload.sbId).toBe("provider-sandbox-id");
    expect(payload.wId).toBe("workspace-id");
    expect(payload.exp).toBeGreaterThan(payload.iat ?? 0);
  });

  it("writes the token, starts the forwarder, and waits for health", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "0 0", stderr: "" })
        )
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "1 0", stderr: "" })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await setupEgressForwarder(auth, sandbox as never);

    expect(result).toEqual(new Ok(undefined));
    expect(mockLookup).toHaveBeenCalledWith("eu.sandbox-egress.dust.tt", {
      family: 4,
    });
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      auth,
      "/etc/dust/egress-token",
      expect.anything()
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      1,
      auth,
      expect.stringContaining("chmod 600 '/etc/dust/egress-token'"),
      { user: "root" }
    );
    expect(mockWriteEgressSecretsFile).toHaveBeenCalledWith(auth, sandbox);
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      auth,
      expect.stringContaining("--proxy-addr '203.0.113.10:4443'"),
      { user: "root" }
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      auth,
      expect.stringContaining("--proxy-tls-name 'eu.sandbox-egress.dust.tt'"),
      { user: "root" }
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      auth,
      expect.stringContaining("--secrets-file '/run/dust/egress-secrets.json'"),
      { user: "root" }
    );
    // The dsbx spawn must strip every trust env var that buildSandboxEnvVars
    // exports on the agent process. Pinning the strip list to the canonical
    // SANDBOX_TRUST_ENV_VARS keys here catches drift between the two sites.
    const spawnCall = sandbox.exec.mock.calls[1][1] as string;
    for (const key of Object.keys(SANDBOX_TRUST_ENV_VARS)) {
      expect(spawnCall).toContain(`-u ${key}`);
    }
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      5,
      auth,
      expect.stringContaining("/run/dust/egress-ca.pem"),
      { user: "root" }
    );
    const installCall = sandbox.exec.mock.calls[4][1] as string;
    expect(installCall).toContain("/usr/local/bin/dust-install-trust-bundle");
    expect(installCall).toContain("/etc/dust/.ca-bundle.merged");
    expect(
      installCall.indexOf("/usr/local/bin/dust-install-trust-bundle")
    ).toBeLessThan(installCall.indexOf("/etc/dust/.ca-bundle.merged"));
    // Pre-0.8.8 sandbox fallback: when the helper script is missing, the
    // exec must inline the system-store + merged-bundle install so old
    // sandboxes don't fail on wake. Remove with the fallback in egress.ts.
    expect(installCall).toContain(
      "if [ -x '/usr/local/bin/dust-install-trust-bundle' ]"
    );
    expect(installCall).toContain("update-ca-certificates");
    expect(installCall).toContain("/etc/ssl/certs/ca-certificates.crt");
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "egress.setup",
        providerId: "provider-sandbox-id",
        sandboxId: "sandbox-id",
      }),
      "Sandbox egress forwarder is healthy"
    );
  });

  it("treats an empty health-probe stdout as fail-closed and restarts dsbx", async () => {
    // Defends the contract that an unparseable health probe (timeout-then-empty,
    // exotic shell, etc.) routes through the same path as "port not listening"
    // rather than silently passing.
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        // First call: health probe with empty stdout.
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        // Restart path: chmod token, start dsbx, kill old dsbx, then health
        // returns 1 0, then install bundle.
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "1 0", stderr: "" })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await ensureSandboxEgressOnExec(auth, sandbox as never, {
      wokeFromSleep: false,
    });

    expect(result).toEqual(new Ok(undefined));
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "egress.health_fail" }),
      expect.any(String)
    );
  });

  it("returns new deny log entries and advances the offset", async () => {
    const sandbox = {
      exec: vi.fn().mockResolvedValue(
        new Ok({
          exitCode: 0,
          stdout: "google.com:443 denied\nevil.com:80 denied\n",
          stderr: "",
        })
      ),
    };

    const result = await readNewDenyLogEntries(auth, sandbox as never);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([
        "google.com:443 denied",
        "evil.com:80 denied",
      ]);
    }
    expect(sandbox.exec).toHaveBeenCalledWith(
      auth,
      expect.stringContaining("dust-egress-denied.log"),
      { user: "root", timeoutMs: 2_000 }
    );
  });

  it("returns empty array when there are no new deny log entries", async () => {
    const sandbox = {
      exec: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await readNewDenyLogEntries(auth, sandbox as never);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it("surfaces setup failures from sandbox commands", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValue(new Err(new Error("sandbox command failed"))),
    };

    const result = await setupEgressForwarder(auth, sandbox as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("sandbox command failed");
    }
  });

  it("surfaces failures from writing the egress secrets file", async () => {
    mockWriteEgressSecretsFile.mockResolvedValue(
      new Err(new Error("secrets write failed"))
    );

    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await setupEgressForwarder(auth, sandbox as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("secrets write failed");
    }
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
  });

  it("does not pass MITM-experiment-related flags to dsbx", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "1 0", stderr: "" })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await setupEgressForwarder(auth, sandbox as never);

    expect(result).toEqual(new Ok(undefined));
    const startCall = sandbox.exec.mock.calls[1][1] as string;
    expect(startCall).not.toContain("--mitm-experiment-host");
    expect(startCall).not.toContain("--mitm-ca-path");
  });

  it("surfaces failures from the MITM trust bundle install", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "1 0", stderr: "" })
        )
        .mockResolvedValueOnce(
          new Ok({ exitCode: 1, stdout: "", stderr: "trust install failed" })
        ),
    };

    const result = await setupEgressForwarder(auth, sandbox as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("trust install failed");
    }
  });

  it("rewrites secrets and restarts dsbx after wake even if health would be ok", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "1 0", stderr: "" })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await ensureSandboxEgressOnExec(auth, sandbox as never, {
      wokeFromSleep: true,
    });

    expect(result).toEqual(new Ok(undefined));
    expect(mockWriteEgressSecretsFile).toHaveBeenCalledWith(auth, sandbox);
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      auth,
      expect.stringContaining("pkill -KILL dsbx"),
      { user: "root" }
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      3,
      auth,
      expect.stringContaining("/opt/bin/dsbx forward"),
      { user: "root" }
    );
  });

  it("reinstalls only the trust bundle when the port is up but the bundle is missing", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      exec: vi
        .fn()
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "1 0", stderr: "" })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await ensureSandboxEgressOnExec(auth, sandbox as never, {
      wokeFromSleep: false,
    });

    expect(result).toEqual(new Ok(undefined));
    expect(sandbox.exec).toHaveBeenCalledTimes(2);
    const installCall = sandbox.exec.mock.calls[1][1] as string;
    expect(installCall).toContain("/usr/local/bin/dust-install-trust-bundle");
    expect(installCall).toContain("/etc/dust/.ca-bundle.merged");
    expect(installCall).not.toContain("pkill");
    expect(installCall).not.toContain("/opt/bin/dsbx forward");
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "egress.bundle_missing" }),
      expect.any(String)
    );
  });

  it("does a full restart when the port is not listening", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "0 0", stderr: "" })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "1 0", stderr: "" })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await ensureSandboxEgressOnExec(auth, sandbox as never, {
      wokeFromSleep: false,
    });

    expect(result).toEqual(new Ok(undefined));
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      3,
      auth,
      expect.stringContaining("pkill -KILL dsbx"),
      { user: "root" }
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "egress.health_fail" }),
      expect.any(String)
    );
  });

  it("returns ok without remediation when both port and bundle are healthy", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      exec: vi
        .fn()
        .mockResolvedValueOnce(
          new Ok({ exitCode: 0, stdout: "1 1", stderr: "" })
        ),
    };

    const result = await ensureSandboxEgressOnExec(auth, sandbox as never, {
      wokeFromSleep: false,
    });

    expect(result).toEqual(new Ok(undefined));
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ event: "egress.health_ok" }),
      expect.any(String)
    );
  });

  describe("teardownInSandboxEgressRedirect", () => {
    const originalIsDev = process.env.IS_DEVELOPMENT;

    beforeEach(() => {
      process.env.IS_DEVELOPMENT = "true";
    });

    afterEach(() => {
      if (originalIsDev === undefined) {
        delete process.env.IS_DEVELOPMENT;
      } else {
        process.env.IS_DEVELOPMENT = originalIsDev;
      }
    });

    it("tears down the in-sandbox nftables redirect", async () => {
      const sandbox = {
        providerId: "provider-sandbox-id",
        sId: "sandbox-id",
        exec: vi
          .fn()
          .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
      };

      const result = await teardownInSandboxEgressRedirect(
        auth,
        sandbox as never
      );

      expect(result).toEqual(new Ok(undefined));
      expect(sandbox.exec).toHaveBeenCalledTimes(1);
      const command = sandbox.exec.mock.calls[0][1] as string;
      expect(command).toContain(
        "systemctl disable --now dust-egress-nftables.service"
      );
      expect(command).toContain("nft delete table ip dust-egress");
      expect(command).toContain("nft delete table ip6 dust-egress");
      expect(sandbox.exec).toHaveBeenCalledWith(auth, expect.any(String), {
        user: "root",
      });
    });

    it("propagates exec failures as Err", async () => {
      const sandbox = {
        providerId: "provider-sandbox-id",
        sId: "sandbox-id",
        exec: vi
          .fn()
          .mockResolvedValue(new Err(new Error("sandbox command failed"))),
      };

      const result = await teardownInSandboxEgressRedirect(
        auth,
        sandbox as never
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("sandbox command failed");
      }
    });

    it("refuses to run outside dev mode", async () => {
      delete process.env.IS_DEVELOPMENT;

      const sandbox = {
        providerId: "provider-sandbox-id",
        sId: "sandbox-id",
        exec: vi.fn(),
      };

      const result = await teardownInSandboxEgressRedirect(
        auth,
        sandbox as never
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("dev-only");
      }
      expect(sandbox.exec).not.toHaveBeenCalled();
    });
  });
});
