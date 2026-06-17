import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateProxyFetch,
  mockGetRequiredUntrustedEgressAgent,
  mockGetStaticIPProxyAgent,
  mockIsHostUnderVerifiedDomain,
  mockIsWorkspaceUsingStaticIP,
} = vi.hoisted(() => ({
  mockCreateProxyFetch: vi.fn(),
  mockGetRequiredUntrustedEgressAgent: vi.fn(),
  mockGetStaticIPProxyAgent: vi.fn(),
  mockIsHostUnderVerifiedDomain: vi.fn(),
  mockIsWorkspaceUsingStaticIP: vi.fn(),
}));

vi.mock("@app/lib/api/workspace_has_domains", () => ({
  isHostUnderVerifiedDomain: mockIsHostUnderVerifiedDomain,
}));

vi.mock("@app/lib/misc", () => ({
  isWorkspaceUsingStaticIP: mockIsWorkspaceUsingStaticIP,
}));

vi.mock("@app/lib/egress/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/egress/server")>();
  return {
    ...actual,
    createProxyFetch: mockCreateProxyFetch,
    getRequiredUntrustedEgressAgent: mockGetRequiredUntrustedEgressAgent,
    getStaticIPProxyAgent: mockGetStaticIPProxyAgent,
  };
});

import { createMCPProxyConfig } from "@app/lib/actions/mcp_metadata";

const auth = {
  getNonNullableWorkspace: () => ({ sId: "workspace-id" }),
} as never;

describe("createMCPProxyConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed when remote MCP metadata would otherwise use direct egress", async () => {
    mockIsWorkspaceUsingStaticIP.mockReturnValue(false);
    mockIsHostUnderVerifiedDomain.mockResolvedValue(false);
    mockGetRequiredUntrustedEgressAgent.mockImplementation(() => {
      throw new Error("missing untrusted egress proxy");
    });

    await expect(createMCPProxyConfig(auth, "mcp.example.com")).rejects.toThrow(
      "missing untrusted egress proxy"
    );
  });

  it("routes non-static remote MCP metadata through the required untrusted egress proxy", async () => {
    const dispatcher = {};
    const fetch = vi.fn();
    mockIsWorkspaceUsingStaticIP.mockReturnValue(false);
    mockIsHostUnderVerifiedDomain.mockResolvedValue(false);
    mockGetRequiredUntrustedEgressAgent.mockReturnValue(dispatcher);
    mockCreateProxyFetch.mockReturnValue(fetch);

    await expect(
      createMCPProxyConfig(auth, "mcp.example.com")
    ).resolves.toEqual({
      dispatcher,
      fetch,
      proxyKind: "untrusted_egress_proxy",
    });
  });

  it("keeps verified static-IP routing isolated from caller-controlled IP literals", async () => {
    const dispatcher = {};
    const fetch = vi.fn();
    mockIsWorkspaceUsingStaticIP.mockReturnValue(false);
    mockIsHostUnderVerifiedDomain.mockResolvedValue(true);
    mockGetStaticIPProxyAgent.mockReturnValue(dispatcher);
    mockCreateProxyFetch.mockReturnValue(fetch);

    await expect(
      createMCPProxyConfig(auth, "oauth.verified.example.com")
    ).resolves.toEqual({
      dispatcher,
      fetch,
      proxyKind: "static_ip_proxy",
    });
    expect(mockGetRequiredUntrustedEgressAgent).not.toHaveBeenCalled();
  });
});
