import { AsyncLocalStorage } from "node:async_hooks";

import type { Authenticator } from "@app/lib/auth";

type McpContext = {
  auth: Authenticator;
};

const mcpContext = new AsyncLocalStorage<McpContext>();

export function runWithMcpContext<T>(context: McpContext, fn: () => T): T {
  return mcpContext.run(context, fn);
}

export function getMcpContext(): McpContext | undefined {
  return mcpContext.getStore();
}

export function getAuthenticatorFromMcpContext(): Authenticator | undefined {
  return getMcpContext()?.auth;
}
