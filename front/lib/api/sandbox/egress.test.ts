import { Err, Ok } from "@app/types/shared/result";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetEgressProxyHost,
  mockGetEgressProxyJwtSecret,
  mockGetEgressProxyPort,
  mockGetEgressProxyTlsName,
  mockGetCurrentRegion,
  mockLoggerInfo,
  mockLookup,
} = vi.hoisted(() => ({
  mockGetEgressProxyHost: vi.fn(),
  mockGetEgressProxyJwtSecret: vi.fn(),
  mockGetEgressProxyPort: vi.fn(),
  mockGetEgressProxyTlsName: vi.fn(),
  mockGetCurrentRegion: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLookup: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getEgressProxyHost: mockGetEgressProxyHost,
    getEgressProxyJwtSecret: mockGetEgressProxyJwtSecret,
    getEgressProxyPort: mockGetEgressProxyPort,
    getEgressProxyTlsName: mockGetEgressProxyTlsName,
  },
}));

vi.mock("@app/lib/api/regions/config", () => ({
  config: {
    getCurrentRegion: mockGetCurrentRegion,
  },
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    info: mockLoggerInfo,
  },
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: mockLookup,
  },
  lookup: mockLookup,
}));

import {
  mintEgressJwt,
  sandboxSupportsEgressForwarding,
  setupEgressForwarder,
} from "./egress";

describe("sandbox egress helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEgressProxyHost.mockReturnValue(undefined);
    mockGetEgressProxyJwtSecret.mockReturnValue("egress-secret");
    mockGetEgressProxyPort.mockReturnValue(4443);
    mockGetEgressProxyTlsName.mockReturnValue(undefined);
    mockGetCurrentRegion.mockReturnValue("europe-west1");
    mockLookup.mockResolvedValue({ address: "203.0.113.10", family: 4 });
  });

  it("mints a proxy JWT bound to the provider sandbox id", () => {
    const token = mintEgressJwt("provider-sandbox-id");
    const payload = jwt.verify(token, "egress-secret", {
      algorithms: ["HS256"],
      audience: "dust-egress-proxy",
      issuer: "dust-front",
    }) as jwt.JwtPayload;

    expect(payload.sbId).toBe("provider-sandbox-id");
    expect(payload.exp).toBeGreaterThan(payload.iat ?? 0);
  });

  it("detects incompatible sandboxes from the compat probe exit code", async () => {
    const sandbox = {
      exec: vi
        .fn()
        .mockResolvedValue(new Ok({ exitCode: 1, stdout: "", stderr: "" })),
    };

    const result = await sandboxSupportsEgressForwarding(
      {} as never,
      sandbox as never
    );

    expect(result).toEqual(new Ok(false));
    expect(sandbox.exec).toHaveBeenCalledWith(
      {},
      expect.stringContaining("test -x /opt/bin/dsbx")
    );
    expect(sandbox.exec).toHaveBeenCalledWith(
      {},
      expect.stringContaining("systemctl is-active --quiet dust-egress-nftables.service")
    );
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
        .mockResolvedValueOnce(new Ok({ exitCode: 0, stdout: "", stderr: "" })),
    };

    const result = await setupEgressForwarder({} as never, sandbox as never);

    expect(result).toEqual(new Ok(undefined));
    expect(mockLookup).toHaveBeenCalledWith("eu.sandbox-egress.dust.tt", {
      family: 4,
    });
    expect(sandbox.writeFile).toHaveBeenCalledWith(
      {},
      "/etc/dust/egress-token",
      expect.anything()
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      1,
      {},
      expect.stringContaining("chown dust-fwd:dust-fwd"),
      { user: "root" }
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      {},
      expect.stringContaining("--proxy-addr '203.0.113.10:4443'"),
      { user: "dust-fwd" }
    );
    expect(sandbox.exec).toHaveBeenNthCalledWith(
      2,
      {},
      expect.stringContaining("--proxy-tls-name 'eu.sandbox-egress.dust.tt'"),
      { user: "dust-fwd" }
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

  it("surfaces setup failures from sandbox commands", async () => {
    const sandbox = {
      providerId: "provider-sandbox-id",
      sId: "sandbox-id",
      writeFile: vi.fn().mockResolvedValue(new Ok(undefined)),
      exec: vi
        .fn()
        .mockResolvedValue(new Err(new Error("sandbox command failed"))),
    };

    const result = await setupEgressForwarder({} as never, sandbox as never);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("sandbox command failed");
    }
  });
});
