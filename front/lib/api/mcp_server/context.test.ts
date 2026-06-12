import {
  buildMcpAuthInfo,
  getAuthenticatorFromMcpContext,
  MCP_AUTHENTICATOR_AUTH_EXTRA_KEY,
} from "@app/lib/api/mcp_server/context";
import type { WorkOSWorkspaceAuthenticator } from "@app/lib/api/workos_authenticator";
import { describe, expect, it } from "vitest";

function makeAuthenticator(userId: string): WorkOSWorkspaceAuthenticator {
  return {
    authMethod: () => "oauth",
    user: () =>
      ({ sId: userId }) as ReturnType<WorkOSWorkspaceAuthenticator["user"]>,
    workspace: () =>
      ({ sId: "w1" }) as ReturnType<WorkOSWorkspaceAuthenticator["workspace"]>,
  } as WorkOSWorkspaceAuthenticator;
}

describe("mcp_server context", () => {
  it("resolves auth from authInfo.extra", () => {
    const auth = makeAuthenticator("user-from-extra");
    const authInfo = buildMcpAuthInfo(auth, "token");

    expect(getAuthenticatorFromMcpContext({ authInfo }).user().sId).toBe(
      "user-from-extra"
    );
  });

  it("stores the authenticator under a stable authInfo extra key", () => {
    const auth = makeAuthenticator("user-1");
    const authInfo = buildMcpAuthInfo(auth, "token");

    expect(authInfo.extra?.[MCP_AUTHENTICATOR_AUTH_EXTRA_KEY]).toBe(auth);
  });

  it("throws when authInfo extra does not contain an authenticator", () => {
    expect(() => getAuthenticatorFromMcpContext({})).toThrow(
      "MCP tool called without authenticated request context."
    );
  });
});
