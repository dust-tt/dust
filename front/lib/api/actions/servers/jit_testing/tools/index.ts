import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { JIT_TESTING_TOOLS_METADATA } from "@app/lib/api/actions/servers/jit_testing/metadata";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof JIT_TESTING_TOOLS_METADATA> = {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  jit_all_optionals_and_defaults: async (params) => {
    return new Ok([
      {
        type: "text" as const,
        text: `JIT testing tool received: ${JSON.stringify(params)}`,
      },
    ]);
  },
};

export const TOOLS = buildTools(JIT_TESTING_TOOLS_METADATA, handlers);
