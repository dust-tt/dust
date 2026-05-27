import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  mockWriteSandboxEnvManifestFile,
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
  mockWriteSandboxEnvManifestFile: vi.fn(),
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

vi.mock("@app/lib/api/sandbox/env_manifest", () => ({
  writeSandboxEnvManifestFile: mockWriteSandboxEnvManifestFile,
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

type HealthcheckOutput = {
  forwarder_port_ok: boolean;
  resolver_udp_ok: boolean;
  resolver_tcp_ok: boolean;
  nft_dns_udp_redirect_ok: boolean;
  nft_dns_tcp_redirect_ok: boolean;
  nft_dns_udp_accept_ok: boolean;
  nft_tcp_forward_redirect_ok: boolean;
  nft_loopback_ssh_drop_ok: boolean;
  nft_udp_drop_ok: boolean;
  nft_icmp_drop_ok: boolean;
  nft_ipv6_drop_ok: boolean;
  bundle_ok: boolean;
};

function healthStdout(overrides: Partial<HealthcheckOutput> = {}): string {
  return JSON.stringify({
    forwarder_port_ok: true,
    resolver_udp_ok: true,
    resolver_tcp_ok: true,
    nft_dns_udp_redirect_ok: true,
    nft_dns_tcp_redirect_ok: true,
    nft_dns_udp_accept_ok: true,
    nft_tcp_forward_redirect_ok: true,
    nft_loopback_ssh_drop_ok: true,
    nft_udp_drop_ok: true,
    nft_icmp_drop_ok: true,
    nft_ipv6_drop_ok: true,
    bundle_ok: true,
    ...overrides,
  });
}

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
    mockWriteSandboxEnvManifestFile.mockResolvedValue(new Ok(undefined));
  });

  function setup(sandbox: unknown) {
    return setupEgressForwarder(auth, sandbox as never);
  }

  function ensure(sandbox: unknown, opts: { wokeFromSleep: boolean }) {
    return ensureSandboxEgressOnExec(auth, sandbox as never, opts);
  }

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
          new Ok({
            exitCode: 0,
            stdout: healthStdout({
              forwarder_port_ok: false,
              bundle_ok: false,
            }),
            stderr: "",
          })
        )
        .mockResolvedValueOnce(
          new Ok({
            exitCode: 0,
            stdout: healthStdout({ bundle_ok: false }),
            stderr: "",
          })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await setup(sandbox);

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
    expect(mockWriteSandboxEnvManifestFile).toHaveBeenCalledWith(auth, sandbox);
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
    const healthCall = sandbox.exec.mock.calls[2][1] as string;
    expect(healthCall).toContain("/opt/bin/dsbx healthcheck");
    expect(healthCall).toContain("--forwarder-listen '127.0.0.1:9990'");
    expect(healthCall).toContain("--resolver-listen '127.0.0.1:1053'");
    expect(healthCall).toContain("--proxied-uid 1003");
    // The healthcheck inspects nftables, which requires CAP_NET_ADMIN, so it
    // must run as root. Pin the exec options to prevent silent regression.
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      3,
      auth,
      expect.stringContaining("/opt/bin/dsbx healthcheck"),
      { user: "root", timeoutMs: 1_000 }
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
      "Sandbox egress is healthy"
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
        // Restart path: chmod token, kill old forwarder, start dsbx, then health
        // returns healthy except for the not-yet-installed bundle.
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(
          new Ok({
            exitCode: 0,
            stdout: healthStdout({ bundle_ok: false }),
            stderr: "",
          })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await ensure(sandbox, { wokeFromSleep: false });

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

  it("resets the deny log offset when the log shrinks", async () => {
    const sandbox = {
      exec: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await readNewDenyLogEntries(auth, sandbox as never);

    expect(result.isOk()).toBe(true);
    const command = sandbox.exec.mock.calls[0][1];
    expect(command).toContain("set -- $_state;");
    expect(command).toContain(
      `if [ "$_total" -lt "$_off" ] || [ "$_size" -lt "$_size_off" ]; then _off=0; fi;`
    );
    expect(command).toContain(
      `echo "$_total $_size" > '/tmp/.dust-egress-deny-offset'`
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

    const result = await setup(sandbox);

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

    const result = await setup(sandbox);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("secrets write failed");
    }
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
  });

  it("surfaces failures from writing the environment manifest file", async () => {
    mockWriteSandboxEnvManifestFile.mockResolvedValue(
      new Err(new Error("manifest write failed"))
    );

    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await setup(sandbox);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("manifest write failed");
    }
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
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
          new Ok({
            exitCode: 0,
            stdout: healthStdout({ bundle_ok: false }),
            stderr: "",
          })
        )
        .mockResolvedValueOnce(
          new Ok({ exitCode: 1, stdout: "", stderr: "trust install failed" })
        ),
    };

    const result = await setup(sandbox);

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
          new Ok({
            exitCode: 0,
            stdout: healthStdout({ bundle_ok: false }),
            stderr: "",
          })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await ensure(sandbox, { wokeFromSleep: true });

    expect(result).toEqual(new Ok(undefined));
    expect(mockWriteEgressSecretsFile).toHaveBeenCalledWith(auth, sandbox);
    expect(mockWriteSandboxEnvManifestFile).toHaveBeenCalledWith(auth, sandbox);
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      auth,
      expect.stringContaining("dsbx forward"),
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
          new Ok({
            exitCode: 0,
            stdout: healthStdout({ bundle_ok: false }),
            stderr: "",
          })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await ensure(sandbox, { wokeFromSleep: false });

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

  it("logs stderr when dsbx healthcheck exits zero but reports unhealthy", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      exec: vi.fn().mockResolvedValueOnce(
        new Ok({
          exitCode: 0,
          stdout: healthStdout({ nft_dns_udp_redirect_ok: false }),
          stderr: "nft: command not found",
        })
      ),
    };

    const result = await ensure(sandbox, { wokeFromSleep: false });

    expect(result.isErr()).toBe(true);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "egress.healthcheck_parse",
        stderr: "nft: command not found",
      }),
      expect.stringContaining("diagnostic stderr")
    );
  });

  it("fails closed when DNS enforcement health is missing", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      exec: vi.fn().mockResolvedValueOnce(
        new Ok({
          exitCode: 0,
          stdout: healthStdout({ resolver_udp_ok: false }),
          stderr: "",
        })
      ),
    };

    const result = await ensure(sandbox, { wokeFromSleep: false });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("DNS enforcement");
    }
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "egress.enforcement_health_fail",
        resolverOk: false,
        nftablesOk: true,
      }),
      expect.any(String)
    );
  });

  it.each([
    "nft_tcp_forward_redirect_ok" as const,
    "nft_loopback_ssh_drop_ok" as const,
    "nft_udp_drop_ok" as const,
    "nft_icmp_drop_ok" as const,
    "nft_ipv6_drop_ok" as const,
  ])("fails closed when %s is false (broader nftables invariant)", async (missing) => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      exec: vi.fn().mockResolvedValueOnce(
        new Ok({
          exitCode: 0,
          stdout: healthStdout({ [missing]: false }),
          stderr: "",
        })
      ),
    };

    const result = await ensure(sandbox, { wokeFromSleep: false });

    expect(result.isErr()).toBe(true);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "egress.enforcement_health_fail",
        nftablesOk: false,
      }),
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
          new Ok({
            exitCode: 0,
            stdout: healthStdout({
              forwarder_port_ok: false,
              bundle_ok: false,
            }),
            stderr: "",
          })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(
          new Ok({
            exitCode: 0,
            stdout: healthStdout({ bundle_ok: false }),
            stderr: "",
          })
        )
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await ensure(sandbox, { wokeFromSleep: false });

    expect(result).toEqual(new Ok(undefined));
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      3,
      auth,
      expect.stringContaining("dsbx forward"),
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
          new Ok({ exitCode: 0, stdout: healthStdout(), stderr: "" })
        ),
    };

    const result = await ensure(sandbox, { wokeFromSleep: false });

    expect(result).toEqual(new Ok(undefined));
    expect(sandbox.exec).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ event: "egress.health_ok" }),
      expect.any(String)
    );
  });

  // The mocked tests above only assert the TS wrapper (stdout parsing, exec
  // options). The actual offset tracking / cap / rotation reset lives in the
  // shell command the function sends to the sandbox. This block runs that
  // exact command through `sh -c` against tempfiles to exercise the real
  // bash logic.
  describe("readNewDenyLogEntries shell behavior", () => {
    let denyLogDir: string;
    let logPath: string;
    let offsetPath: string;

    beforeEach(() => {
      denyLogDir = mkdtempSync(join(tmpdir(), "deny-log-"));
      logPath = join(denyLogDir, "deny.log");
      offsetPath = join(denyLogDir, "deny-offset");
    });

    afterEach(() => {
      rmSync(denyLogDir, { recursive: true, force: true });
    });

    // Re-points the command's hardcoded log + offset paths at our tempfiles,
    // then runs it through `sh -c` and returns the parsed lines. Each call
    // mirrors what `readNewDenyLogEntries` does on the sandbox: parse stdout,
    // drop blank lines, persist the new offset state.
    async function runReader(): Promise<string[]> {
      const sandbox = {
        exec: vi.fn(async (_auth: unknown, command: string) => {
          const rewritten = command
            .replace(/'\/tmp\/dust-egress-denied\.log'/g, `'${logPath}'`)
            .replace(/'\/tmp\/\.dust-egress-deny-offset'/g, `'${offsetPath}'`);
          const result = spawnSync("sh", ["-c", rewritten], {
            encoding: "utf8",
          });
          return new Ok({
            exitCode: result.status ?? 0,
            stdout: result.stdout,
            stderr: result.stderr,
          });
        }),
      };

      const result = await readNewDenyLogEntries(auth, sandbox as never);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw new Error("unreachable");
      }
      return result.value;
    }

    it("returns nothing when the deny log file does not exist", async () => {
      expect(await runReader()).toEqual([]);
    });

    it("returns all entries on first read, then only new entries", async () => {
      writeFileSync(logPath, "a denied\nb denied\n");
      expect(await runReader()).toEqual(["a denied", "b denied"]);

      writeFileSync(logPath, "a denied\nb denied\nc denied\n");
      expect(await runReader()).toEqual(["c denied"]);
    });

    it("returns nothing on a second read when the log has not grown", async () => {
      writeFileSync(logPath, "a denied\n");
      expect(await runReader()).toEqual(["a denied"]);
      expect(await runReader()).toEqual([]);
    });

    it("resets the offset and replays from the start when the log is truncated", async () => {
      writeFileSync(logPath, "a denied\nb denied\n");
      await runReader();

      // Simulate rotation: file shrinks below the persisted offset.
      writeFileSync(logPath, "x denied\n");
      expect(await runReader()).toEqual(["x denied"]);
    });

    it("resets the offset when the log size shrinks but line count is unchanged", async () => {
      writeFileSync(logPath, "long-line-a denied\nlong-line-b denied\n");
      await runReader();

      // Same line count, smaller bytes: still must reset.
      writeFileSync(logPath, "a\nb\n");
      expect(await runReader()).toEqual(["a", "b"]);
    });

    it("caps lines returned per call and drops the overflow", async () => {
      // 50 lines in a single burst, cap is 20. Document that the overflow is
      // dropped on this call AND not replayed on the next call (the offset
      // is advanced to the file's total, not to "offset + cap").
      const lines = Array.from({ length: 50 }, (_, i) => `line${i} denied`);
      writeFileSync(logPath, lines.join("\n") + "\n");

      const first = await runReader();
      expect(first).toHaveLength(20);
      expect(first[0]).toBe("line0 denied");
      expect(first[19]).toBe("line19 denied");

      // Overflow is gone, not queued for the next call.
      expect(await runReader()).toEqual([]);
    });

    it("recovers from a malformed offset state file by resetting to zero", async () => {
      writeFileSync(logPath, "a denied\nb denied\n");
      writeFileSync(offsetPath, "garbage notanumber\n");
      expect(await runReader()).toEqual(["a denied", "b denied"]);
    });

    it("recovers from an empty offset state file", async () => {
      writeFileSync(logPath, "a denied\n");
      writeFileSync(offsetPath, "");
      expect(await runReader()).toEqual(["a denied"]);
    });
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
        "systemctl disable --now dust-egress-resolver.service dust-egress-nftables.service"
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
