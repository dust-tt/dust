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
        .mockResolvedValueOnce(new Ok({ exitCode: 1, stdout: "", stderr: "" }))
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
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
      5,
      auth,
      expect.stringContaining("/run/dust/egress-ca.pem"),
      { user: "root" }
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "egress.setup",
        providerId: "provider-sandbox-id",
        sandboxId: "sandbox-id",
      }),
      "Sandbox egress forwarder is healthy"
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
        .mockResolvedValue(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
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
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
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
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" }))
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
      expect.stringContaining("pkill -TERM dsbx"),
      { user: "root" }
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      3,
      auth,
      expect.stringContaining("/opt/bin/dsbx forward"),
      { user: "root" }
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
