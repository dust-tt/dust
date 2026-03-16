import {
  getMCPServerAdminAuthenticationReason,
  MCPServerRequiresAdminAuthenticationError,
} from "@app/lib/actions/mcp_authentication";
import { DustError } from "@app/lib/error";
import { describe, expect, it } from "vitest";

describe("MCP admin authentication mapping", () => {
  it("maps a missing workspace connection to setup", () => {
    const reason = getMCPServerAdminAuthenticationReason(
      new DustError("connection_not_found", "Connection not found")
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
      new DustError(
        "mcp_access_token_error",
        "Failed to get access token for MCP server"
      )
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
