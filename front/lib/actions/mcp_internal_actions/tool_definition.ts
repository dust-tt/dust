import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";
import type { z } from "zod";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPError } from "@app/lib/actions/mcp_errors";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type {
  InternalMCPServerDefinitionType,
  MCPToolType,
} from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";

export type ToolHandlerExtra = RequestHandlerExtra<
  ServerRequest,
  ServerNotification
> & {
  agentLoopContext?: AgentLoopContextType;
  auth?: Authenticator;
};

export type ToolHandlerResult = Result<CallToolResult["content"], MCPError>;

export interface ToolDefinition<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> {
  name: TName;
  description: string;
  schema: TSchema;
  stake: MCPToolStakeLevelType;
  handler: (
    params: z.infer<z.ZodObject<TSchema>>,
    extra: ToolHandlerExtra
  ) => Promise<ToolHandlerResult>;
}

export type ToolMeta<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> = Omit<ToolDefinition<TName, TSchema>, "handler">;

export function createToolsRecord<
  T extends Record<string, Omit<ToolMeta, "name">>,
>(tools: T): { [K in keyof T]: T[K] & { name: K } } {
  return Object.fromEntries(
    Object.entries(tools).map(([key, value]) => [key, { ...value, name: key }])
  ) as { [K in keyof T]: T[K] & { name: K } };
}

export function defineTool<TName extends string, TSchema extends ZodRawShape>(
  def: ToolDefinition<TName, TSchema>
): ToolDefinition<TName, TSchema> {
  return def;
}

export function registerTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined,
  monitoringName: string,
  tool: ToolDefinition
): void {
  server.tool(
    tool.name,
    tool.description,
    tool.schema,
    withToolLogging(
      auth,
      { toolNameForMonitoring: monitoringName, agentLoopContext },
      (params, extra) =>
        tool.handler(params, { ...extra, agentLoopContext, auth })
    )
  );
}

export interface ServerMetadata {
  serverInfo: InternalMCPServerDefinitionType;
  tools: MCPToolType[];
  tools_stakes: Record<string, MCPToolStakeLevelType>;
}
