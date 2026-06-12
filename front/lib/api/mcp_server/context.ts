import {
  isWorkOSWorkspaceAuthenticator,
  type WorkOSWorkspaceAuthenticator,
} from "@app/lib/api/workos_authenticator";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export type { WorkOSWorkspaceAuthenticator } from "@app/lib/api/workos_authenticator";

export const MCP_AUTHENTICATOR_AUTH_EXTRA_KEY = "dustAuthenticator";

export type McpRequestExtra = {
  authInfo?: AuthInfo;
};

export function buildMcpAuthInfo(
  auth: WorkOSWorkspaceAuthenticator,
  token: string
): AuthInfo {
  return {
    token,
    clientId: "",
    scopes: [],
    extra: {
      [MCP_AUTHENTICATOR_AUTH_EXTRA_KEY]: auth,
    },
  };
}

export function getAuthenticatorFromMcpContext(
  extra: McpRequestExtra
): WorkOSWorkspaceAuthenticator {
  const auth = extra.authInfo?.extra?.[MCP_AUTHENTICATOR_AUTH_EXTRA_KEY];
  if (!isWorkOSWorkspaceAuthenticator(auth)) {
    throw new Error("MCP tool called without authenticated request context.");
  }
  return auth;
}
