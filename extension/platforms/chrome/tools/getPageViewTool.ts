import { clientFetch } from "@app/lib/egress/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FileUploadRequestResponseBody } from "@app/pages/api/w/[wId]/files";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CaptureService } from "@extension/shared/services/capture";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Max characters of extracted text to include inline in the tool result.
// The full content is also indexed in the conversation JIT data source.
const MAX_EXTRACTED_TEXT_CHARS = 100_000;

type UploadError = { error: string };

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Creates a file record via the Dust API and uploads the blob content.
 * Returns the file sId on success, or an error message on failure.
 */
async function createAndUpload(
  workspaceId: string,
  blob: Blob,
  fileName: string,
  mimeType: string
): Promise<{ fileId: string } | UploadError> {
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
    const msg = await createRes.text();
    return { error: `Failed to create file record: ${msg}` };
  }

  const { file } = (await createRes.json()) as FileUploadRequestResponseBody;

  const formData = new FormData();
  formData.append("file", blob, fileName);

  const uploadRes = await clientFetch(file.uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    return { error: `Failed to upload file: ${msg}` };
  }

  return { fileId: file.sId };
}

function makeFileResource(
  workspaceId: string,
  fileId: string,
  fileName: string,
  contentType: string,
  text: string,
  snippet: string | null
) {
  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
    uri: `/api/w/${workspaceId}/files/${fileId}`,
    text,
    // The MCP SDK strips non-standard fields from resource objects during
    // parsing. We store Dust-specific fields (fileId, title, etc.) in _meta
    // so they survive the MCP protocol round-trip. The server will move
    // them back to the root level in mcp_actions.ts (tryCallMCPTool).
    _meta: { fileId, title: fileName, contentType, snippet },
  };
}

/**
 * Uploads a PDF to the Dust file API and fetches the server-extracted text.
 * Returns the file ID, name, and extracted text, or an error on failure.
 */
async function uploadPdf(
  workspaceId: string,
  base64: string,
  mimeType: string,
  pageUrl: string
): Promise<
  | { fileId: string; fileName: string; extractedText: string | null }
  | UploadError
> {
  try {
    const urlFilename = pageUrl.split("/").pop()?.split("?")[0];
    const fileName = urlFilename || "document.pdf";
    const blob = base64ToBlob(base64, mimeType);

    const uploaded = await createAndUpload(
      workspaceId,
      blob,
      fileName,
      mimeType
    );
    if ("error" in uploaded) {
      return uploaded;
    }

    // Fetch the extracted text (processed version).
    // The server ran OCR-enabled text extraction during upload, so it's ready now.
    let extractedText: string | null = null;
    try {
      const textRes = await clientFetch(
        `/api/w/${workspaceId}/files/${uploaded.fileId}?version=processed&action=view`
      );
      if (textRes.ok) {
        const text = await textRes.text();
        extractedText = text.slice(0, MAX_EXTRACTED_TEXT_CHARS) || null;
      }
    } catch (err) {
      console.warn("[getPageViewTool] Could not fetch extracted text:", err);
    }

    return { fileId: uploaded.fileId, fileName, extractedText };
  } catch (error) {
    return {
      error: `Unexpected error uploading PDF: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Uploads an image to the Dust file API.
 * Returns the file ID and name, or an error message on failure.
 */
async function uploadImage(
  workspaceId: string,
  base64: string,
  mimeType: string,
  fileName: string
): Promise<{ fileId: string; fileName: string } | UploadError> {
  try {
    const blob = base64ToBlob(base64, mimeType);

    if (blob.size > 5 * 1024 * 1024) {
      const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
      return { error: `Image is too large (${sizeMb} MB, max 5 MB).` };
    }

    const uploaded = await createAndUpload(
      workspaceId,
      blob,
      fileName,
      mimeType
    );
    if ("error" in uploaded) {
      return uploaded;
    }

    return { fileId: uploaded.fileId, fileName };
  } catch (error) {
    return {
      error: `Unexpected error uploading image: ${error instanceof Error ? error.message : String(error)}`,
    };
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

        const { captures, fileData, title } = result.value;

        if (fileData) {
          const { base64, mimeType, url } = fileData;

          if (mimeType === "application/pdf") {
            const data = await uploadPdf(workspaceId, base64, mimeType, url);
            if ("error" in data) {
              return { content: [{ type: "text", text: data.error }] };
            }
            const resource = makeFileResource(
              workspaceId,
              data.fileId,
              data.fileName,
              mimeType,
              data.extractedText ?? `PDF from ${url}`,
              data.extractedText ? data.extractedText.slice(0, 500) : null
            );
            return { content: [{ type: "resource" as const, resource }] };
          }

          // For images, upload to Dust and return as a ToolGeneratedFile resource
          // so the agent can visually analyze it.
          if (mimeType.startsWith("image/")) {
            const urlFilename = url.split("/").pop()?.split("?")[0];
            const fileName = urlFilename || `image.${mimeType.split("/")[1]}`;
            const data = await uploadImage(
              workspaceId,
              base64,
              mimeType,
              fileName
            );
            if ("error" in data) {
              return { content: [{ type: "text", text: data.error }] };
            }
            const resource = makeFileResource(
              workspaceId,
              data.fileId,
              data.fileName,
              mimeType,
              "",
              null
            );
            return { content: [{ type: "resource" as const, resource }] };
          }
        }

        if (!captures || captures.length === 0) {
          return {
            content: [{ type: "text", text: "No screenshot captured." }],
          };
        }

        // Upload each screenshot and return as ToolGeneratedFile resources
        // so the agent can visually analyze them.
        const uploadedCaptures = await concurrentExecutor(
          captures,
          async (dataUrl, i) => {
            const [header, data] = dataUrl.split(",");
            const mimeType = header.replace("data:", "").replace(";base64", "");
            const ext = mimeType.split("/")[1] ?? "jpg";
            const base = captures.length > 1 ? `${title} (${i + 1})` : title;
            const fileName = `${base}.${ext}`;
            const uploaded = await uploadImage(
              workspaceId,
              data,
              mimeType,
              fileName
            );
            if ("error" in uploaded) {
              return { type: "text" as const, text: uploaded.error };
            }
            const resource = makeFileResource(
              workspaceId,
              uploaded.fileId,
              uploaded.fileName,
              mimeType,
              "",
              null
            );
            return { type: "resource" as const, resource };
          },
          { concurrency: 8 }
        );

        return { content: uploadedCaptures };
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
