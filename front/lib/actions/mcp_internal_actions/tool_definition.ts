import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolRunContextType } from "@app/lib/actions/types";
import type {
  InternalMCPServerDefinitionType,
  MCPToolType,
  ToolCostCategory,
  ToolDisplayLabels,
} from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape, z } from "zod";

export type ToolHandlerExtra = RequestHandlerExtra<
  ServerRequest,
  ServerNotification
> & {
  auth: Authenticator;
  runContext: ToolRunContextType;
};

export type ToolHandlerResult = Result<CallToolResult["content"], MCPError>;

export type ToolHandlers<T extends Record<string, { schema: ZodRawShape }>> = {
  [K in keyof T]: (
    params: z.infer<z.ZodObject<T[K]["schema"]>>,
    extra: ToolHandlerExtra
  ) => Promise<ToolHandlerResult>;
};

export type ClientToolHandlers<
  T extends Record<string, { schema: ZodRawShape }>,
> = {
  [K in keyof T]: (
    params: z.infer<z.ZodObject<T[K]["schema"]>>
  ) => Promise<ToolHandlerResult>;
};

export interface ToolDefinition<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> {
  name: TName;
  enableAlerting?: boolean;
  // When true, the tool is kept in the cached tools prefix (loaded upfront)
  // instead of being deferred behind tool search. Defaults to deferred.
  eager?: boolean;
  description: string;
  schema: TSchema;
  stake: MCPToolStakeLevelType;
  displayLabels: ToolDisplayLabels;
  toolCostCategory: ToolCostCategory;
  freeUsage: boolean;
  handler: (
    params: z.infer<z.ZodObject<TSchema>>,
    extra: ToolHandlerExtra
  ) => Promise<ToolHandlerResult>;
}

interface ClientToolDefinition<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> {
  name: TName;
  enableAlerting?: boolean;
  description: string;
  schema: TSchema;
  stake: MCPToolStakeLevelType;
  displayLabels: ToolDisplayLabels;
  toolCostCategory: ToolCostCategory;
  freeUsage: boolean;
  argumentsRequiringApproval?: Array<
    Extract<keyof z.infer<z.ZodObject<TSchema>>, string>
  >;
  handler: (
    params: z.infer<z.ZodObject<TSchema>>
  ) => Promise<ToolHandlerResult>;
}

export type ToolMeta<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> = Omit<ToolDefinition<TName, TSchema>, "handler">;

export type ClientToolMeta<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> = Omit<ClientToolDefinition<TName, TSchema>, "handler">;

export function createToolsRecord<
  T extends Record<string, Omit<ToolMeta, "name">>,
>(tools: T): { [K in keyof T]: T[K] & { name: K } } {
  return Object.fromEntries(
    Object.entries(tools).map(([key, value]) => [key, { ...value, name: key }])
  ) as { [K in keyof T]: T[K] & { name: K } };
}

export function createClientToolsRecord<
  T extends {
    [K in keyof T]: T[K] extends { schema: infer S extends ZodRawShape }
      ? Omit<ClientToolMeta<string, S>, "name">
      : Omit<ClientToolMeta, "name">;
  },
>(tools: T): { [K in keyof T]: T[K] & { name: K } } {
  return Object.fromEntries(
    Object.entries(tools).map(([key, value]) => [
      key,
      { ...(value as object), name: key },
    ])
  ) as { [K in keyof T]: T[K] & { name: K } };
}

export function buildClientTools<T extends Record<string, ClientToolMeta>>(
  metadata: T,
  handlers: ClientToolHandlers<T>
): ClientToolDefinition[] {
  return (Object.keys(metadata) as (keyof T & string)[]).map(
    (key) =>
      ({
        ...metadata[key],
        handler: handlers[key],
      }) as unknown as ClientToolDefinition
  );
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

// Internal MCP server tools must have displayLabels (unlike remote servers).
export type InternalMCPToolType<TName extends string = string> = Omit<
  MCPToolType,
  "name" | "displayLabels"
> & {
  name: TName;
  displayLabels: ToolDisplayLabels;
  toolCostCategory: ToolCostCategory;
  freeUsage: boolean;
};

export type ServerMetadata<
  TServerName extends
    InternalMCPServerDefinitionType["name"] = InternalMCPServerDefinitionType["name"],
  TToolName extends string = string,
> = {
  serverInfo: InternalMCPServerDefinitionType & { name: TServerName };
  tools: InternalMCPToolType<TToolName>[];
  tools_stakes: Record<TToolName, MCPToolStakeLevelType>;
};
