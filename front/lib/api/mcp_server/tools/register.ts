import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import type { WorkOSWorkspaceAuthenticator } from "@app/lib/api/workos_authenticator";
import type {
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

type DustMcpInputSchema = Record<string, z.ZodTypeAny>;

type InferMcpToolArgs<T extends DustMcpInputSchema> = {
  [K in keyof T]: z.infer<T[K]>;
};

type DustMcpToolConfig<T extends DustMcpInputSchema | undefined = undefined> = {
  title?: string;
  description?: string;
  inputSchema?: T;
  _meta?: Record<string, unknown>;
};

type DustMcpToolHandlerResult = CallToolResult | Promise<CallToolResult>;

type DustMcpToolHandler<T extends DustMcpInputSchema | undefined> =
  T extends DustMcpInputSchema
    ? (
        auth: WorkOSWorkspaceAuthenticator,
        args: InferMcpToolArgs<T>
      ) => DustMcpToolHandlerResult
    : (auth: WorkOSWorkspaceAuthenticator) => DustMcpToolHandlerResult;

export function registerDustMcpTool<
  T extends DustMcpInputSchema | undefined = undefined,
>(
  server: McpServer,
  name: string,
  config: DustMcpToolConfig<T>,
  handler: DustMcpToolHandler<T>
): void {
  if (config.inputSchema === undefined) {
    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        _meta: config._meta,
      },
      ((extra) => {
        const auth = getAuthenticatorFromMcpContext(extra);
        return (handler as DustMcpToolHandler<undefined>)(auth);
      }) as ToolCallback<undefined>
    );
    return;
  }

  server.registerTool(name, config, ((args, extra) => {
    const auth = getAuthenticatorFromMcpContext(extra);
    return (handler as DustMcpToolHandler<DustMcpInputSchema>)(auth, args);
  }) as ToolCallback<DustMcpInputSchema>);
}
