import {
  buildClientTools,
  type ClientToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";

import type { CaptureService } from "@extension/shared/services/capture";
import { attachTabsTextTool } from "@extension/shared/tools/attachPageTextTool";
import { interactWithPageTool } from "@extension/shared/tools/interactWithPageTool";
import { listBrowserTabsTool } from "@extension/shared/tools/listTabsTool";
import {
  ATTACH_TABS_TEXT_TOOL_NAME,
  CHROME_TOOLS_METADATA,
  CLOSE_BROWSER_TAB_TOOL_NAME,
  INTERACT_WITH_PAGE_TOOL_NAME,
  LIST_BROWSER_TABS_TOOL_NAME,
  MOVE_BROWSER_TAB_TOOL_NAME,
  OPEN_BROWSER_TAB_TOOL_NAME,
  RELOAD_BROWSER_TAB_TOOL_NAME,
  SWITCH_TO_BROWSER_TAB_TOOL_NAME,
  TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME,
} from "@extension/shared/tools/metadata";
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
    [ATTACH_TABS_TEXT_TOOL_NAME]: (params) =>
      attachTabsTextTool({ ...params, captureService }),
    [TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME]: (params) =>
      takeScreenshotOrAttachFileTool({
        ...params,
        captureService,
        workspaceId,
      }),
    [LIST_BROWSER_TABS_TOOL_NAME]: () => listBrowserTabsTool(),
    [SWITCH_TO_BROWSER_TAB_TOOL_NAME]: (params) => switchBrowserTabTool(params),
    [CLOSE_BROWSER_TAB_TOOL_NAME]: (params) => closeBrowserTabTool(params),
    [MOVE_BROWSER_TAB_TOOL_NAME]: (params) => moveBrowserTabTool(params),
    [OPEN_BROWSER_TAB_TOOL_NAME]: (params) => openBrowserTab(params),
    [RELOAD_BROWSER_TAB_TOOL_NAME]: (params) => reloadBrowserTabTool(params),
    [INTERACT_WITH_PAGE_TOOL_NAME]: (params) => interactWithPageTool(params),
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
