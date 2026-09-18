import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatMcpDescription } from "@app/lib/api/assistant/global_agents/sidekick_context";
import { describeMcpServer } from "@app/lib/api/assistant/workspace_capabilities";
import { Ok } from "@app/types/shared/result";

export async function getToolDetails(
  { toolId }: { toolId: string },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const server = await describeMcpServer(auth, toolId);
  if (!server) {
    return new Ok([
      {
        type: "text",
        text: `No tool found with id ${toolId} (it may not be accessible).`,
      },
    ]);
  }

  return new Ok([{ type: "text", text: formatMcpDescription(toolId, server) }]);
}
