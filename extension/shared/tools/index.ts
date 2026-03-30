import {
  buildClientTools,
  type ClientToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";

import type { CaptureService } from "@extension/shared/services/capture";
import { attachTabsTextTool } from "@extension/shared/tools/attachPageTextTool";
import { interactWithPageTool } from "@extension/shared/tools/interactWithPageTool";
import { listBrowserTabsTool } from "@extension/shared/tools/listTabsTool";
import { CHROME_TOOLS_METADATA } from "@extension/shared/tools/metadata";
import {
  closeBrowserTabTool,
  moveBrowserTabTool,
  openBrowserTab,
  reloadBrowserTabTool,
  switchBrowserTabTool,
} from "@extension/shared/tools/tabActionTools";
import { takeScreenshotOrAttachFileTool } from "@extension/shared/tools/takeScreenshotOrAttachFileTool";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
    attach_tabs_text: (params) =>
      attachTabsTextTool({ ...params, captureService }),
    take_screenshot_or_attach_file: (params) =>
      takeScreenshotOrAttachFileTool({
        ...params,
        captureService,
        workspaceId,
      }),
    list_browser_tabs: () => listBrowserTabsTool(),
    switch_to_browser_tab: (params) => switchBrowserTabTool(params),
    close_browser_tab: (params) => closeBrowserTabTool(params),
    move_browser_tab: (params) => moveBrowserTabTool(params),
    open_browser_tab: (params) => openBrowserTab(params),
    reload_browser_tab: (params) => reloadBrowserTabTool(params),
    interact_with_page: (params) => interactWithPageTool(params),
  };

  const tools = buildClientTools(CHROME_TOOLS_METADATA, handlers);

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        _meta: {
          dust: {
            stake: tool.stake,
            displayLabels: tool.displayLabels,
            ...(tool.argumentsRequiringApproval
              ? { argumentsRequiringApproval: tool.argumentsRequiringApproval }
              : {}),
          },
        },
      },
      async (params) => {
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
      }
    );
  }
}
