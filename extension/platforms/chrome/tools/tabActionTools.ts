import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok } from "@app/types/shared/result";
import { sendTabActionMessage } from "@extension/platforms/chrome/messages";
import { normalizeError } from "@extension/shared/lib/utils";

/**
 * Registers tab manipulation tools with the MCP server.
 */

export async function activateBrowserTabTool({
  tabId,
}: {
  tabId: number;
}): Promise<ToolHandlerResult> {
  try {
    const result = await sendTabActionMessage({
      type: "ACTIVATE_TAB",
      tabId,
    });
    if (!result.success) {
      return new Err(new MCPError(`Error: ${result.error ?? "Unknown"}`));
    }
    return new Ok([{ type: "text", text: `Activated tab ${tabId}.` }]);
  } catch (error) {
    return new Err(
      new MCPError(`Failed to activate tab: ${normalizeError(error).message}`)
    );
  }
}

export async function closeBrowserTabTool({
  tabId,
}: {
  tabId: number;
}): Promise<ToolHandlerResult> {
  try {
    const result = await sendTabActionMessage({
      type: "CLOSE_TAB",
      tabId,
    });
    if (!result.success) {
      return new Err(new MCPError(`Error: ${result.error ?? "Unknown"}`));
    }
    return new Ok([{ type: "text", text: `Closed tab ${tabId}.` }]);
  } catch (error) {
    return new Err(
      new MCPError(`Failed to close tab: ${normalizeError(error).message}`)
    );
  }
}

export async function openBrowserTab({
  url,
}: {
  url: string;
}): Promise<ToolHandlerResult> {
  try {
    const result = await sendTabActionMessage({ type: "OPEN_TAB", url });
    if (!result.success) {
      return new Err(new MCPError(`Error: ${result.error ?? "Unknown"}`));
    }
    return new Ok([
      {
        type: "text",
        text: `Opened new tab${result.tabId ? ` (ID: ${result.tabId})` : ""} with URL: ${url}`,
      },
    ]);
  } catch (error) {
    return new Err(
      new MCPError(`Failed to open tab: ${normalizeError(error).message}`)
    );
  }
}

export async function moveBrowserTabTool({
  tabId,
  index,
}: {
  tabId: number;
  index: number;
}): Promise<ToolHandlerResult> {
  try {
    const result = await sendTabActionMessage({
      type: "MOVE_TAB",
      tabId,
      index,
    });
    if (!result.success) {
      return new Err(new MCPError(`Error: ${result.error ?? "Unknown"}`));
    }
    return new Ok([
      {
        type: "text",
        text: `Moved tab ${tabId} to position ${index}.`,
      },
    ]);
  } catch (error) {
    return new Err(
      new MCPError(`Failed to move tab: ${normalizeError(error).message}`)
    );
  }
}

export async function reloadBrowserTabTool({
  tabId,
}: {
  tabId: number;
}): Promise<ToolHandlerResult> {
  try {
    const result = await sendTabActionMessage({
      type: "RELOAD_TAB",
      tabId,
    });
    if (!result.success) {
      return new Err(new MCPError(`Error: ${result.error ?? "Unknown"}`));
    }
    return new Ok([{ type: "text", text: `Reloaded tab ${tabId}.` }]);
  } catch (error) {
    return new Err(
      new MCPError(`Failed to reload tab: ${normalizeError(error).message}`)
    );
  }
}
