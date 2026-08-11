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

export type BaseToolHandlerExtra = RequestHandlerExtra<
  ServerRequest,
  ServerNotification
>;

export type ToolHandlerExtra = BaseToolHandlerExtra & {
  auth: Authenticator;
  runContext: ToolRunContext;
};

// Tool handlers return the model-facing content blocks, optionally paired with a
// machine-readable `structuredContent` payload (MCP `CallToolResult.structuredContent`,
// preserved end-to-end for programmatic consumers such as sandbox functions). The bare
// content array remains supported so existing handlers keep compiling unchanged.
export type ToolHandlerOutput =
  | CallToolResult["content"]
  | {
      content: CallToolResult["content"];
      structuredContent: NonNullable<CallToolResult["structuredContent"]>;
    };

export function normalizeToolHandlerOutput(output: ToolHandlerOutput): {
  content: CallToolResult["content"];
  structuredContent?: CallToolResult["structuredContent"];
} {
  if (Array.isArray(output)) {
    return { content: output };
  }
  return output;
}

export type ToolHandlerResult = Result<ToolHandlerOutput, MCPError>;

export type ToolHandlers<
  ToolsList extends readonly ToolMeta[],
  // Keep tool names as a separate generic so that generic consumers don't widen them to strings.
  ToolNames extends string = ToolsList[number]["name"],
  THandlerExtra = ToolHandlerExtra,
> = {
  [ToolName in ToolNames]: (
    // Type the params with the type inferred from the zod schema (z.ZodObject because it's a zod shape, not a schema).
    params: z.infer<
      z.ZodObject<Extract<ToolsList[number], { name: ToolName }>["schema"]>
    >,
    extra: THandlerExtra
  ) => Promise<ToolHandlerResult>;
};

export type ClientToolHandlers<
  ToolsList extends readonly ToolMeta[],
  ToolNames extends string = ToolsList[number]["name"],
> = ToolHandlers<ToolsList, ToolNames, BaseToolHandlerExtra>;

export interface ToolDefinition<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
  THandlerExtra = ToolHandlerExtra,
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
  editableArguments?: ReadonlyArray<
    Extract<keyof z.infer<z.ZodObject<TSchema>>, string>
  >;
  handler(
    params: z.infer<z.ZodObject<TSchema>>,
    extra: THandlerExtra
  ): Promise<ToolHandlerResult>;
}

export type ToolMeta<
  TName extends string = string,
  TSchema extends ZodRawShape = ZodRawShape,
> = Omit<ToolDefinition<TName, TSchema>, "handler">;

// Type that ties the values in `argumentsRequiringApproval` with the actual parameter names in the schema.
type ValidToolMetadata<T extends readonly ToolMeta[]> = {
  [K in keyof T]: {
    argumentsRequiringApproval?: ReadonlyArray<
      Extract<keyof z.infer<z.ZodObject<T[K]["schema"]>>, string>
    >;
    editableArguments?: ReadonlyArray<
      Extract<keyof z.infer<z.ZodObject<T[K]["schema"]>>, string>
    >;
  };
};

export function buildTools<
  const TName extends string,
  const T extends readonly ToolMeta<TName>[],
  // Internal tools always receive auth and runContext, while client-side tools do not.
  THandlerExtra = ToolHandlerExtra,
>(
  metadata: T & ValidToolMetadata<T>,
  handlers: ToolHandlers<T, TName, THandlerExtra>
): ToolDefinition<TName, ZodRawShape, THandlerExtra>[] {
  return metadata.map((tool) => ({
    ...tool,
    handler: handlers[tool.name],
  }));
}

export type ServerMetadata = {
  serverInfo: InternalMCPServerDefinitionType;
  tools: readonly ToolMeta[];
};
