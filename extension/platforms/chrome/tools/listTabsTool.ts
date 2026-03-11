import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok } from "@app/types/shared/result";
import { sendListTabsMessage } from "@extension/platforms/chrome/messages";
import { normalizeError } from "@extension/shared/lib/utils";

/**
 * Registers the list-browser-tabs tool with the MCP server.
 * Lists all open tabs in the current browser window.
 */
export async function listBrowserTabsTool(): Promise<ToolHandlerResult> {
  try {
    const result = await sendListTabsMessage();
    const tabs = result.tabs ?? [];

    if (!tabs || tabs.length === 0) {
      return new Err(new MCPError("No tabs found."));
    }

    const lines = tabs.map(
      (t) => `${t.active ? "* " : "  "}[${t.tabId}] ${t.title} — ${t.url}`
    );

    return new Ok([{ type: "text", text: lines.join("\n") }]);
  } catch (error) {
    return new Err(
      new MCPError(`Failed to list tabs: ${normalizeError(error).message}`)
    );
  }
}
