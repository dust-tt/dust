import { AsyncLocalStorage } from "node:async_hooks";

import type { McpAuthenticator } from "@app/lib/api/mcp_server/authenticator";

export type { McpAuthenticator } from "@app/lib/api/mcp_server/authenticator";

type McpContext = {
  auth: McpAuthenticator;
};

const mcpContext = new AsyncLocalStorage<McpContext>();

export function runWithMcpContext<T>(
  context: { auth: McpAuthenticator },
  fn: () => T
): T {
  return mcpContext.run(context, fn);
}

export function getMcpContext(): McpContext | undefined {
  return mcpContext.getStore();
}

export function getAuthenticatorFromMcpContext(): McpAuthenticator {
  const auth = getMcpContext()?.auth;
  if (!auth) {
    throw new Error(
      "getAuthenticatorFromMcpContext called outside MCP context."
    );
  }
  return auth;
}
