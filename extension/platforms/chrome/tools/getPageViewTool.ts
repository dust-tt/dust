import { clientFetch } from "@app/lib/egress/client";
import type { FileUploadRequestResponseBody } from "@app/pages/api/w/[wId]/files";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CaptureService } from "@extension/shared/services/capture";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Max characters of extracted text to include inline in the tool result.
// The full content is also indexed in the conversation JIT data source.
const MAX_EXTRACTED_TEXT_CHARS = 100_000;

/**
 * Uploads a PDF to the Dust file API and fetches the server-extracted text.
 * Returns the file ID, name, and extracted text, or null on failure.
 */
async function uploadPdf(
  workspaceId: string,
  base64: string,
  mimeType: string,
  pageUrl: string
): Promise<{
  fileId: string;
  fileName: string;
  extractedText: string | null;
} | null> {
  try {
    const urlFilename = pageUrl.split("/").pop()?.split("?")[0];
    const fileName = urlFilename || "document.pdf";

    // Convert base64 to Blob.
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    // Step 1: Create the file record and get the upload URL.
    const createRes = await clientFetch(`/api/w/${workspaceId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: mimeType,
        fileName,
        fileSize: blob.size,
        useCase: "conversation",
      }),
    });

    if (!createRes.ok) {
      console.error(
        "[getPageViewTool] Failed to create file record:",
        await createRes.text()
      );
      return null;
    }

    const { file } = (await createRes.json()) as FileUploadRequestResponseBody;

    // Step 2: Upload the file contentcreateServerForWorkspace. The server runs text extraction
    // synchronously, so the processed version is ready when this resolves.
    const formData = new FormData();
    formData.append("file", blob, fileName);

    const uploadRes = await clientFetch(file.uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      console.error(
        "[getPageViewTool] Failed to upload file content:",
        await uploadRes.text()
      );
      return null;
    }

    // Step 3: Fetch the extracted text (processed version).
    // The server ran OCR-enabled text extraction during upload, so it's ready now.
    let extractedText: string | null = null;
    try {
      const textRes = await clientFetch(
        `/api/w/${workspaceId}/files/${file.sId}?version=processed&action=view`
      );
      if (textRes.ok) {
        const text = await textRes.text();
        extractedText = text.slice(0, MAX_EXTRACTED_TEXT_CHARS) || null;
      }
    } catch (err) {
      console.warn("[getPageViewTool] Could not fetch extracted text:", err);
    }

    return { fileId: file.sId, fileName, extractedText };
  } catch (error) {
    console.error("[getPageViewTool] Error uploading PDF:", error);
    return null;
  }
}

/**
 * Registers the get-current-browser-page-view tool with the MCP server.
 * Captures a screenshot or attaches the file content of a browser tab.
 */
export function registerGetPageViewTool(
  server: McpServer,
  captureService: CaptureService | null,
  workspaceId: string
): void {
  server.tool(
    "get-current-browser-page-view",
    "Captures or attaches the content of a browser tab. " +
      "For PDF pages, uploads the file and returns the full extracted text so you can read it. " +
      "For image pages, returns the image directly so you can visually analyze it. " +
      "For HTML pages, takes a screenshot for visual inspection (Drive canvas, dashboards, etc.)." +
      "Use list-browser-tabs to discover tab IDs.",
    {
      tabId: z
        .number()
        .optional()
        .describe(
          "The tab ID to capture. If omitted, captures the active tab. Use list-browser-tabs to get tab IDs."
        ),
    },
    async ({ tabId }) => {
      if (!captureService) {
        return {
          content: [{ type: "text", text: "Capture service not available." }],
        };
      }

      try {
        const result = await captureService.handleOperation(
          "capture-page-content",
          { includeContent: false, includeCapture: true, tabId }
        );

        if (result.isErr()) {
          return {
            content: [{ type: "text", text: `Error: ${result.error.message}` }],
          };
        }

        const { captures, fileData } = result.value;

        if (fileData) {
          const { base64, mimeType, url } = fileData;

          if (mimeType === "application/pdf") {
            const data = await uploadPdf(workspaceId, base64, mimeType, url);
            if (data) {
              // The MCP SDK strips non-standard fields from resource objects during
              // parsing. We store Dust-specific fields (fileId, title, etc.) in _meta
              // so they survive the MCP protocol round-trip. The server will move
              // them back to the root level in mcp_actions.ts (tryCallMCPTool).
              const resource = {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
                uri: `/api/w/${workspaceId}/files/${data.fileId}`,
                text: data.extractedText ?? `PDF from ${url}`,
                _meta: {
                  fileId: data.fileId,
                  title: data.fileName,
                  contentType: mimeType,
                  snippet: data.extractedText
                    ? data.extractedText.slice(0, 500)
                    : null,
                },
              };
              return {
                content: [{ type: "resource" as const, resource }],
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: "Failed to process the PDF. It may be too large or inaccessible.",
                },
              ],
            };
          }

          // For images, return the raw image so the model can analyze it visually.
          if (mimeType.startsWith("image/")) {
            return {
              content: [{ type: "image" as const, data: base64, mimeType }],
            };
          }
        }

        if (!captures || captures.length === 0) {
          return {
            content: [{ type: "text", text: "No screenshot captured." }],
          };
        }

        return {
          content: captures.map((dataUrl) => {
            const [header, data] = dataUrl.split(",");
            const mimeType = header.replace("data:", "").replace(";base64", "");
            return { type: "image" as const, data, mimeType };
          }),
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to capture page: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
