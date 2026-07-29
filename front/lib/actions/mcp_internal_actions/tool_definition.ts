import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolRunContext } from "@app/lib/actions/types";
import type {
  InternalMCPServerDefinitionType,
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

export type MCPToolHandlerExtra = RequestHandlerExtra<
  ServerRequest,
  ServerNotification
>;

export type ToolHandlerExtra = MCPToolHandlerExtra & {
  auth: Authenticator;
  runContext: ToolRunContext;
};

export type ToolHandlerResult = Result<CallToolResult["content"], MCPError>;

export type ToolHandlers<
  ToolsList extends readonly ToolMeta[],
  HandlerExtra = ToolHandlerExtra,
  // Keep tool names as a separate generic so that generic consumers don't widen them to strings.
  ToolNames extends string = ToolsList[number]["name"],
> = {
  [ToolName in ToolNames]: (
    // Type the params with the type inferred from the zod schema (z.ZodObject because it's a zod shape, not a schema).
    params: z.infer<
      z.ZodObject<Extract<ToolsList[number], { name: ToolName }>["schema"]>
    >,
    extra: HandlerExtra
  ) => Promise<ToolHandlerResult>;
};

export type ClientToolHandlers<
  ToolsList extends readonly ToolMeta[],
  ToolNames extends string = ToolsList[number]["name"],
> = ToolHandlers<ToolsList, MCPToolHandlerExtra, ToolNames>;

export interface ToolDefinition<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
  HandlerExtra = ToolHandlerExtra,
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
  argumentsRequiringApproval?: ReadonlyArray<
    Extract<keyof z.infer<z.ZodObject<TSchema>>, string>
  >;
  handler(
    params: z.infer<z.ZodObject<TSchema>>,
    extra: HandlerExtra
  ): Promise<ToolHandlerResult>;
}

export type ToolMeta<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> = Omit<ToolDefinition<TName, TSchema>, "handler">;

export function buildTools<
  const TName extends string,
  const T extends readonly ToolMeta<TName>[],
  // Internal tools always receive auth and runContext, while client-side tools do not.
  HandlerExtra = ToolHandlerExtra,
>(
  metadata: T,
  handlers: ToolHandlers<T, HandlerExtra, TName>
): ToolDefinition<TName, ZodRawShape, HandlerExtra>[] {
  return metadata.map((tool) => ({
    ...tool,
    handler: handlers[tool.name],
  }));
}

export type ServerMetadata = {
  serverInfo: InternalMCPServerDefinitionType;
  tools: readonly ToolMeta[];
};
