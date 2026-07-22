import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { PRIMITIVE_TYPES_DEBUGGER_TOOLS_METADATA } from "@app/lib/api/actions/servers/primitive_types_debugger/metadata";
import { Ok } from "@app/types/shared/result";

// Handlers object - TypeScript enforces exhaustivity via ToolHandlers<T>
export const PRIMITIVE_TYPES_DEBUGGER_TOOL_HANDLERS: ToolHandlers<
  typeof PRIMITIVE_TYPES_DEBUGGER_TOOLS_METADATA
> = {
  tool_without_user_config: async ({ query }) => {
    return new Ok([
      {
        type: "text" as const,
        text: `Found the following configuration: ${query}.`,
      },
    ]);
  },

  pass_through: async (params) => {
    return new Ok([
      {
        type: "text" as const,
        text: `Found the following configuration: ${JSON.stringify(params)}.`,
      },
    ]);
  },
};
