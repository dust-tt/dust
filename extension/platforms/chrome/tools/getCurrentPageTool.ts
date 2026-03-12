import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@extension/shared/lib/utils";
import type { CaptureService } from "@extension/shared/services/capture";

/**
 * Registers the get-current-browser-page tool with the MCP server.
 * Extracts the text content of a browser tab.
 */
export async function getPageTool({
  tabId,
  captureService,
}: {
  tabId: number;
  captureService: CaptureService | null;
}): Promise<ToolHandlerResult> {
  if (!captureService) {
    return new Err(new MCPError("Capture service not available."));
  }

  try {
    const result = await captureService.handleOperation(
      "capture-page-content",
      { includeContent: true, includeCapture: false, tabId }
    );

    if (result.isErr()) {
      return new Err(new MCPError(`Error: ${result.error.message}`));
    }

    const { title, url, content } = result.value;
    const parts = [`Title: ${title}`, `URL: ${url}`];
    if (content) {
      parts.push(`Content:\n${content}`);
    }

    return new Ok([{ type: "text", text: parts.join("\n") }]);
  } catch (error) {
    return new Err(
      new MCPError(normalizeError(error).message) ??
        "An unknown error occurred while capturing page content."
    );
  }
}
