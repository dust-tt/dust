import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { CAT_LINES_DEFAULT } from "@app/lib/api/actions/servers/files/metadata";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import { isReadableAsText } from "@app/lib/api/actions/servers/files/tools/utils";
import {
  byteOffsetBeyondEndMessage,
  fileChangedMessage,
  readTextFilePage,
  renderTextFilePage,
  TEXT_FILE_PAGE_CONTENT_BUDGET_BYTES,
} from "@app/lib/api/files/text_file_pagination";
import { isLLMVisionSupportedImageContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { Readable } from "stream";

const CAT_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB vision limit.

function catImage(
  filePath: string,
  {
    path,
    mimeType,
    sizeBytes,
  }: { path: string; mimeType: string; sizeBytes: number }
): ToolHandlerResult {
  if (sizeBytes > CAT_IMAGE_MAX_BYTES) {
    return new Ok([
      {
        type: "text",
        text:
          `\`${path}\` is an image (${Math.ceil(sizeBytes / 1024)} KB) ` +
          `that exceeds the ${CAT_IMAGE_MAX_BYTES / 1024} KB vision limit and cannot be displayed.`,
      },
    ]);
  }

  return new Ok([
    {
      type: "resource",
      resource: {
        uri: `dust://files/${path}`,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.MODEL_VISION_IMAGE,
        text: "" as const,
        filePath,
        imageContentType: mimeType,
      },
    },
  ]);
}

async function catText(
  stream: Readable,
  {
    path,
    fileSizeBytes,
    maxLines,
    startLine,
    byteOffset,
  }: {
    path: string;
    fileSizeBytes: number;
    maxLines: number;
    startLine: number;
    byteOffset: number | null;
  }
): Promise<ToolHandlerResult> {
  let rendered;
  try {
    const page = await readTextFilePage(stream, {
      fileSizeBytes,
      maxLines,
      budgetBytes: TEXT_FILE_PAGE_CONTENT_BUDGET_BYTES,
      startLine,
      byteOffset,
    });
    rendered = renderTextFilePage(page, {
      path,
      fileSizeBytes,
      startLine,
      byteOffset,
    });
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to read file \`${path}\`: ${normalizeError(err).message}`
      )
    );
  }

  if (rendered.outcome === "file_changed") {
    return new Err(new MCPError(fileChangedMessage(path), { tracked: false }));
  }

  return new Ok([{ type: "text", text: rendered.text }]);
}

export async function catHandler(
  {
    path,
    offset,
    limit,
    byte_offset: byteOffset,
  }: { path: string; offset?: number; limit?: number; byte_offset?: number },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ runContext });
  if (conversationRes.isErr()) {
    return conversationRes;
  }

  const fsResult = await getDustFileSystemForAgentLoop(
    auth,
    conversationRes.value,
    scopedPathsFromArgs(path)
  );
  if (fsResult.isErr()) {
    return fsResult;
  }

  const dustFs = fsResult.value;

  const statResult = await dustFs.stat(path);
  if (statResult.isErr()) {
    return new Err(new MCPError(statResult.error.message, { tracked: false }));
  }

  if (statResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  const { contentType: mimeType, sizeBytes } = statResult.value;

  if (isLLMVisionSupportedImageContentType(mimeType)) {
    return catImage(path, { path, mimeType, sizeBytes });
  }

  if (!isReadableAsText(mimeType)) {
    return new Ok([
      {
        type: "text",
        text: `\`${path}\` is a binary file (${mimeType}) and cannot be read as text.`,
      },
    ]);
  }

  if (byteOffset !== undefined && byteOffset >= sizeBytes) {
    return new Err(
      new MCPError(byteOffsetBeyondEndMessage(path, byteOffset, sizeBytes), {
        tracked: false,
      })
    );
  }

  const readResult = await dustFs.read(path);
  if (readResult.isErr()) {
    return new Err(new MCPError(readResult.error.message, { tracked: false }));
  }

  if (readResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  return catText(readResult.value, {
    path,
    fileSizeBytes: sizeBytes,
    maxLines: limit ?? CAT_LINES_DEFAULT,
    // Models often default-fill `offset: 1` alongside a footer's `byte_offset`; the
    // continuation must not depend on perfect argument hygiene, so `byte_offset` wins.
    startLine: byteOffset !== undefined ? 1 : (offset ?? 1),
    byteOffset: byteOffset ?? null,
  });
}
