import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { SuggestArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { Ok } from "@app/types/shared/result";

export async function suggestHandler(
  { suggestions }: SuggestArgs,
  _extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  return new Ok([
    {
      type: "text" as const,
      text: `Received ${suggestions.length} suggestion(s).`,
    },
  ]);
}
