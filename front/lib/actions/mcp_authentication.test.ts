import {
  getConnectionForMCPServer,
  getMCPServerAdminAuthenticationReason,
  MCPServerRequiresAdminAuthenticationError,
} from "@app/lib/actions/mcp_authentication";
import { getMCPConnectionAccessToken } from "@app/lib/actions/mcp_oauth_access_token";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/actions/mcp_oauth_access_token", () => ({
  getMCPConnectionAccessToken: vi.fn(),
}));

vi.mock("@app/lib/resources/mcp_server_connection_resource", () => ({
  MCPServerConnectionResource: { findByMCPServer: vi.fn() },
}));

const auth = {
  getNonNullableWorkspace: () => ({ sId: "wId_test" }),
} as unknown as Authenticator;

describe("getConnectionForMCPServer", () => {
  beforeEach(() => {
    vi.mocked(MCPServerConnectionResource.findByMCPServer).mockResolvedValue(
      new Ok({ connectionId: "con_test" } as MCPServerConnectionResource)
    );
  });

  it("reports an unreachable OAuth service separately from a broken token", async () => {
    vi.mocked(getMCPConnectionAccessToken).mockResolvedValue(
      new Err({
        code: "unexpected_network_error",
        message:
          "Unexpected network error from OAuthAPI: TypeError: fetch failed",
      })
    );

    const result = await getConnectionForMCPServer(auth, {
      mcpServerId: "ims_test",
      connectionType: "personal",
    });

    // The connection exists; only the token fetch failed on the network. Callers must be able to
    // tell this from a credential problem, which is the only case re-authenticating can fix.
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("oauth_service_unreachable");
    }
  });

  it("keeps a genuine token failure as an access-token error", async () => {
    vi.mocked(getMCPConnectionAccessToken).mockResolvedValue(
      new Err({ code: "token_revoked_error", message: "token revoked" })
    );

    const result = await getConnectionForMCPServer(auth, {
      mcpServerId: "ims_test",
      connectionType: "personal",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("mcp_access_token_error");
    }
  });
});

describe("MCP admin authentication mapping", () => {
  it("maps a missing workspace connection to setup", () => {
    const reason = getMCPServerAdminAuthenticationReason(
      "connection_not_found"
    );
    const error = new MCPServerRequiresAdminAuthenticationError(
      "ims_test",
      "jira",
      undefined,
      reason
    );

    expect(reason).toBe("setup");
    expect(error.message).toContain("set up the workspace connection");
  });

  it("maps a broken workspace token to reconnect", () => {
    const reason = getMCPServerAdminAuthenticationReason(
      "mcp_access_token_error"
    );
    const error = new MCPServerRequiresAdminAuthenticationError(
      "ims_test",
      "jira",
      undefined,
      reason
    );

    expect(reason).toBe("reconnect");
    expect(error.message).toContain("reconnect the workspace connection");
  });
});
