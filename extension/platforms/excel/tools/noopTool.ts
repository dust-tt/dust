import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Ok } from "@app/types/shared/result";

export async function noopTool(): Promise<ToolHandlerResult> {
  return new Ok([
    { type: "text", text: "The Excel add-in tools are reachable." },
  ]);
}
