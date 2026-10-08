import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerResult } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { Err, Ok } from "@app/types/shared/result";
import {
  getTabNotOnDomainError,
  normalizeError,
} from "@extension/shared/lib/utils";
import type { CaptureService } from "@extension/shared/services/capture";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Registers the take_screenshot_or_attach_file tool with the MCP server.
 * Captures a screenshot or attaches the file content of a browser tab.
 */
export async function takeScreenshotOrAttachFileTool({
  tabIds,
  domainToFetch,
  captureService,
}: {
  tabIds: number[];
  domainToFetch: string;
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
        { includeContent: false, includeCapture: true, tabId }
      );

      if (result.isErr()) {
        errors.push(new MCPError(`Error: ${result.error.message}`));
        continue;
      }

      const domainError = getTabNotOnDomainError({
        tabId,
        tabUrl: result.value.url ?? "",
        domainToFetch,
      });
      if (domainError) {
        errors.push(new MCPError(domainError));
        continue;
      }

      const { captures, fileData } = result.value;

      if (fileData) {
        const { base64, mimeType, url } = fileData;

        if (mimeType === "application/pdf") {
          const fileName =
            url.split("/").pop()?.split("?")[0] || "document.pdf";
          results.push({
            type: "resource" as const,
            resource: { uri: fileName, mimeType, blob: base64 },
          });
          continue;
        }

        // For images, return the raw image so the model can analyze it visually.
        if (mimeType.startsWith("image/")) {
          results.push({ type: "image" as const, data: base64, mimeType });
          continue;
        }
      }

      if (!captures || captures.length === 0) {
        errors.push(new MCPError("No screenshot captured."));
        continue;
      }

      results.push(
        ...captures.map((dataUrl) => {
          const [header, data] = dataUrl.split(",");
          const mimeType = header.replace("data:", "").replace(";base64", "");
          return { type: "image" as const, data, mimeType };
        })
      );
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
