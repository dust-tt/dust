import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { PRIMITIVE_TYPES_DEBUGGER_TOOLS_METADATA } from "@app/lib/api/actions/servers/primitive_types_debugger/metadata";
import { Ok } from "@app/types/shared/result";

// Handlers object - TypeScript enforces exhaustivity via ToolHandlers<T>
const handlers: ToolHandlers<typeof PRIMITIVE_TYPES_DEBUGGER_TOOLS_METADATA> = {
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

// Export tools array using buildTools helper
export const TOOLS = buildTools(
  PRIMITIVE_TYPES_DEBUGGER_TOOLS_METADATA,
  handlers
);
