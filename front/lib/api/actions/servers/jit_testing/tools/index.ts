import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JIT_TESTING_TOOLS_METADATA } from "@app/lib/api/actions/servers/jit_testing/metadata";
import { Ok } from "@app/types/shared/result";

export const JIT_TESTING_TOOL_HANDLERS: ToolHandlers<
  typeof JIT_TESTING_TOOLS_METADATA
> = {
  jit_all_optionals_and_defaults: async (params) => {
    return new Ok([
      {
        type: "text" as const,
        text: `JIT testing tool received: ${JSON.stringify(params)}`,
      },
    ]);
  },
};
