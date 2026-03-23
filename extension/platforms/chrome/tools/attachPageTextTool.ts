import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@extension/shared/lib/utils";
import type { CaptureService } from "@extension/shared/services/capture";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Registers the attach_page_text tool with the MCP server.
 * Extracts the text content of a browser tab.
 */
export async function attachTabsTextTool({
  tabIds,
  captureService,
}: {
  tabIds: number[];
  captureService: CaptureService | null;
}): Promise<ToolHandlerResult> {
  if (!captureService) {
    return new Err(new MCPError("Capture service not available."));
  }

  const results: CallToolResult["content"] = [];
  const errors: Error[] = [];

  if (tabIds.length === 0) {
    return new Err(new MCPError("No tabs specified."));
  }

  for (const tabId of tabIds) {
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

      results.push({ type: "text", text: parts.join("\n") });
    } catch (error) {
      errors.push(normalizeError(error));
    }
  }

  if (results.length === 0) {
    return new Err(
      new MCPError(errors.map((error) => error.message).join("\n")) ??
        "An unknown error occurred while capturing page content."
    );
  }

  return new Ok(results);
}
