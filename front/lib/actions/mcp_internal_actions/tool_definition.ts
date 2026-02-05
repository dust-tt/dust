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
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type {
  InternalMCPServerDefinitionType,
  MCPToolType,
  ToolDisplayLabels,
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

export type ToolHandlers<T extends Record<string, { schema: ZodRawShape }>> = {
  [K in keyof T]: (
    params: z.infer<z.ZodObject<T[K]["schema"]>>,
    extra: ToolHandlerExtra
  ) => Promise<ToolHandlerResult>;
};

// UI metadata for tools that return rich UI content
export interface ToolUIMetadata {
  // MCP resource URI that provides the UI content (e.g., "ui://gmail/emails")
  resourceUri: string;
  // Optional CSP directives for the iframe
  csp?: Record<string, string>;
}

export interface ToolDefinition<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> {
  name: TName;
  enableAlerting?: boolean;
  description: string;
  schema: TSchema;
  stake: MCPToolStakeLevelType;
  displayLabels?: ToolDisplayLabels;
  // UI metadata for MCP Apps - when present, the tool output will be rendered in an iframe
  ui?: ToolUIMetadata;
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

export function buildTools<T extends Record<string, ToolMeta>>(
  metadata: T,
  handlers: ToolHandlers<T>
): ToolDefinition[] {
  return (Object.keys(metadata) as (keyof T & string)[]).map(
    (key) =>
      ({
        ...metadata[key],
        handler: handlers[key],
      }) as unknown as ToolDefinition
  );
}

export interface ServerMetadata {
  serverInfo: InternalMCPServerDefinitionType;
  tools: MCPToolType[];
  tools_stakes: Record<string, MCPToolStakeLevelType>;
}
