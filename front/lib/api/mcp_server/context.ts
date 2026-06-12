import { AsyncLocalStorage } from "node:async_hooks";

import type { WorkOSWorkspaceAuthenticator } from "@app/lib/api/workos_authenticator";

export type { WorkOSWorkspaceAuthenticator } from "@app/lib/api/workos_authenticator";

type McpContext = {
  auth: WorkOSWorkspaceAuthenticator;
};

const mcpContext = new AsyncLocalStorage<McpContext>();

export function runWithMcpContext<T>(
  context: { auth: WorkOSWorkspaceAuthenticator },
  fn: () => T
): T {
  return mcpContext.run(context, fn);
}

export function getMcpContext(): McpContext | undefined {
  return mcpContext.getStore();
}

export function getAuthenticatorFromMcpContext(): WorkOSWorkspaceAuthenticator {
  const auth = getMcpContext()?.auth;
  if (!auth) {
    throw new Error(
      "getAuthenticatorFromMcpContext called outside MCP context."
    );
  }
  return auth;
}
