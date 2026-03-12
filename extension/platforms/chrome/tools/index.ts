import { CHROME_TOOLS_METADATA } from "@app/lib/actions/mcp_client_side/metadata";
import {
  buildClientTools,
  type ClientToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPageTool } from "@extension/platforms/chrome/tools/getCurrentPageTool";
import type { CaptureService } from "@extension/shared/services/capture";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentTabInfoTool } from "./getCurrentTabInfo";
import { getPageViewTool } from "./getPageViewTool";
import { interactWithPageTool } from "./interactWithPageTool";
import { listBrowserTabsTool } from "./listTabsTool";
import {
  activateBrowserTabTool,
  closeBrowserTabTool,
  moveBrowserTabTool,
  openBrowserTab,
  reloadBrowserTabTool,
} from "./tabActionTools";

/**
 * Registers all Chrome MCP tools with the server
 * @param server The MCP server to register tools with
 * @param captureService The capture service for retrieving page content
 */
export function registerAllTools(
  server: McpServer,
  captureService: CaptureService | null,
  workspaceId: string
): void {
  const handlers: ClientToolHandlers<typeof CHROME_TOOLS_METADATA> = {
    get_browser_page: (params) => getPageTool({ ...params, captureService }),
    get_browser_page_view: (params) =>
      getPageViewTool({ ...params, captureService, workspaceId }),
    list_browser_tabs: () => listBrowserTabsTool(),
    get_current_tab_info: () => getCurrentTabInfoTool(),
    activate_browser_tab: (params) => activateBrowserTabTool(params),
    close_browser_tab: (params) => closeBrowserTabTool(params),
    move_browser_tab: (params) => moveBrowserTabTool(params),
    open_browser_tab: (params) => openBrowserTab(params),
    reload_browser_tab: (params) => reloadBrowserTabTool(params),
    interact_with_page: (params) => interactWithPageTool(params),
  };

  const tools = buildClientTools(CHROME_TOOLS_METADATA, handlers);

  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.schema, async (params) => {
      const result = await tool.handler(params);
      if (result.isErr()) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: result.error.message }],
        };
      }
      return {
        isError: false,
        content: result.value,
      };
    });
  }
}
