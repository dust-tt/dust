import {
  buildTools,
  type ClientToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";

import { attachTabsTextTool } from "@extension/shared/browser_tools/attachPageTextTool";
import { interactWithPageTool } from "@extension/shared/browser_tools/interactWithPageTool";
import { listBrowserTabsTool } from "@extension/shared/browser_tools/listTabsTool";
import {
  ATTACH_TABS_TEXT_TOOL_NAME,
  BROWSER_TOOLS_METADATA,
  CLOSE_BROWSER_TAB_TOOL_NAME,
  INTERACT_WITH_PAGE_TOOL_NAME,
  LIST_BROWSER_TABS_TOOL_NAME,
  MOVE_BROWSER_TAB_TOOL_NAME,
  OPEN_BROWSER_TAB_TOOL_NAME,
  RELOAD_BROWSER_TAB_TOOL_NAME,
  SWITCH_TO_BROWSER_TAB_TOOL_NAME,
  TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME,
} from "@extension/shared/browser_tools/metadata";
import {
  closeBrowserTabTool,
  moveBrowserTabTool,
  openBrowserTab,
  reloadBrowserTabTool,
  switchBrowserTabTool,
} from "@extension/shared/browser_tools/tabActionTools";
import { takeScreenshotOrAttachFileTool } from "@extension/shared/browser_tools/takeScreenshotOrAttachFileTool";
import { registerClientTools } from "@extension/shared/lib/mcp_tools";
import type { CaptureService } from "@extension/shared/services/capture";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers all browser MCP tools with the server
 * @param server The MCP server to register tools with
 * @param captureService The capture service for retrieving page content
 */
export function registerAllTools(
  server: McpServer,
  captureService: CaptureService | null
): void {
  const handlers: ClientToolHandlers<typeof BROWSER_TOOLS_METADATA> = {
    [ATTACH_TABS_TEXT_TOOL_NAME]: (params) =>
      attachTabsTextTool({ ...params, captureService }),
    [TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME]: (params) =>
      takeScreenshotOrAttachFileTool({ ...params, captureService }),
    [LIST_BROWSER_TABS_TOOL_NAME]: () => listBrowserTabsTool(),
    [SWITCH_TO_BROWSER_TAB_TOOL_NAME]: (params) => switchBrowserTabTool(params),
    [CLOSE_BROWSER_TAB_TOOL_NAME]: (params) => closeBrowserTabTool(params),
    [MOVE_BROWSER_TAB_TOOL_NAME]: (params) => moveBrowserTabTool(params),
    [OPEN_BROWSER_TAB_TOOL_NAME]: (params) => openBrowserTab(params),
    [RELOAD_BROWSER_TAB_TOOL_NAME]: (params) => reloadBrowserTabTool(params),
    [INTERACT_WITH_PAGE_TOOL_NAME]: (params) => interactWithPageTool(params),
  };

  const tools = buildTools(BROWSER_TOOLS_METADATA, handlers);

  registerClientTools(server, tools);
}
