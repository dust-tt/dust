import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok } from "@app/types/shared/result";
import { sendGetCurrentTabInfoMessage } from "@extension/platforms/chrome/messages";
import { normalizeError } from "@extension/shared/lib/utils";

export async function getCurrentTabInfoTool(): Promise<ToolHandlerResult> {
  try {
    const result = await sendGetCurrentTabInfoMessage();
    const tabs = result.tabs ?? [];

    if (!tabs || tabs.length === 0) {
      return new Err(new MCPError("No tabs found."));
    }

    const currentTab = tabs.find((t) => t.active);

    if (!currentTab) {
      return new Err(new MCPError("No active tab found."));
    }

    return new Ok([
      {
        type: "text",
        text: `[${currentTab.tabId}] ${currentTab.title} — ${currentTab.url}`,
      },
    ]);
  } catch (error) {
    return new Err(
      new MCPError(`Failed to list tabs: ${normalizeError(error).message}`)
    );
  }
}
