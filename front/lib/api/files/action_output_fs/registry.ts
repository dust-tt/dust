import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import {
  isBrowseResultResourceType,
  isDataSourceNodeContentType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { uriToSlug } from "@app/lib/api/files/action_output_fs/naming";
import type { AllSupportedFileContentType } from "@app/types/files";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Registry mapping tool output blocks to GCS persistence descriptors.
//
// To add support for a new type: add one branch to resolveResourceOutput.
// Reuse the typeguard and type already defined in output_schemas.ts.

export interface ResolvedOutput {
  fileName: string;
  content: string;
  storageContentType: AllSupportedFileContentType;
}

/**
 * Maps a resource block to a GCS persistence descriptor.
 * Returns null if the block type is not eligible for persistence.
 */
export function resolveResourceOutput(
  block: CallToolResult["content"][number]
): ResolvedOutput | null {
  if (isDataSourceNodeContentType(block)) {
    const r = block.resource;
    return {
      fileName: r.metadata.title,
      content: r.text,
      storageContentType: "text/plain",
    };
  }

  if (isBrowseResultResourceType(block)) {
    const r = block.resource;
    return {
      fileName: r.title ?? uriToSlug(r.uri),
      content: r.text,
      storageContentType: "text/plain",
    };
  }

  return null;
}

export function shouldOffloadTextBlock(
  block: CallToolResult["content"][number]
): block is { type: "text"; text: string } {
  return (
    block.type === "text" &&
    Buffer.byteLength(block.text, "utf8") > FILE_OFFLOAD_TEXT_SIZE_BYTES
  );
}
