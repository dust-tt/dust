import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Size limits for MCP tool outputs
export const MAX_TEXT_CONTENT_SIZE = 2 * 1024 * 1024; // 2MB.
const MAX_IMAGE_CONTENT_SIZE = 2 * 1024 * 1024; // 2MB.
export const MAX_RESOURCE_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB.

export const MAXED_OUTPUT_FILE_SNIPPET_LENGTH = 64_000; // Approximately 16K tokens.

export function computeTextByteSize(text: string): number {
  return text.length * 2; // UTF-8 approximate
}

function computeBase64ByteSize(base64: string): number {
  return Math.ceil((base64.length * 3) / 4);
}

export function getMaxSize(item: CallToolResult["content"][number]) {
  switch (item.type) {
    case "text":
      return MAX_TEXT_CONTENT_SIZE;
    case "image":
      return MAX_IMAGE_CONTENT_SIZE;
    case "resource":
      return MAX_RESOURCE_CONTENT_SIZE;
    default:
      return 1 * 1024 * 1024; // 1MB default
  }
}

export function calculateContentSize(
  item: CallToolResult["content"][number]
): number {
  switch (item.type) {
    case "text":
      return computeTextByteSize(item.text);
    case "image":
      return computeBase64ByteSize(item.data);
    case "resource":
      if (
        "blob" in item.resource &&
        item.resource.blob &&
        typeof item.resource.blob === "string"
      ) {
        return computeBase64ByteSize(item.resource.blob);
      }
      if ("text" in item.resource && typeof item.resource.text === "string") {
        return computeTextByteSize(item.resource.text);
      }
      return 0;
    case "audio":
      return item.data.length;
    default:
      return 0;
  }
}

export function isValidContentSize(
  content: CallToolResult["content"]
): boolean {
  return !content.some((item) => calculateContentSize(item) > getMaxSize(item));
}
