import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Thresholds for offloading MCP tool output items to files.
// When a single content block exceeds these sizes, it gets stored as a file and replaced with a
// snippet + file reference.
export const FILE_OFFLOAD_TEXT_SIZE_BYTES = 20 * 1024; // 20KB.
export const FILE_OFFLOAD_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB.
export const FILE_OFFLOAD_RESOURCE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB.

export const FILE_OFFLOAD_SNIPPET_LENGTH = 8_000; // Approximately 2K tokens.

// Hard limits for remote MCP server tool results.
// When any content block exceeds these sizes, the entire tool result is rejected.
export const REMOTE_MAX_TEXT_SIZE_BYTES = 2 * 1024 * 1024; // 2MB.
export const REMOTE_MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB.
export const REMOTE_MAX_RESOURCE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB.

export function computeTextByteSize(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function computeBase64ByteSize(base64: string): number {
  return Math.ceil((base64.length * 3) / 4);
}

export function getRemoteContentMaxSize(
  item: CallToolResult["content"][number]
) {
  switch (item.type) {
    case "text":
      return REMOTE_MAX_TEXT_SIZE_BYTES;

    case "image":
      return REMOTE_MAX_IMAGE_SIZE_BYTES;

    case "resource":
      return REMOTE_MAX_RESOURCE_SIZE_BYTES;

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

export function isWithinRemoteContentLimit(
  content: CallToolResult["content"]
): boolean {
  return !content.some(
    (item) => calculateContentSize(item) > getRemoteContentMaxSize(item)
  );
}
