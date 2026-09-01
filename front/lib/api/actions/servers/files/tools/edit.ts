import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  CREATE_CONTENT_MAX_BYTES,
  FILES_CAT_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import {
  frameSourceUpdatedNotice,
  isReadableAsText,
} from "@app/lib/api/actions/servers/files/tools/utils";
import { FRAME_SOURCE_MAX_BYTES } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { DustFileSystem } from "@app/lib/api/file_system";
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import { executeWithLock, isLockAcquisitionTimeoutError } from "@app/lib/lock";
import {
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { pluralize } from "@app/types/shared/utils/string_utils";

const FILE_EDIT_LOCK_ACQUISITION_TIMEOUT_MS = 30_000;
const FILE_EDIT_LOCK_TTL_MS = 30_000;
const FILE_EDIT_LOCK_RETRY_INTERVAL_MS = 25;

type EditHandlerArgs = {
  path: string;
  old_string: string;
  new_string: string;
  expected_replacements?: number;
};

async function editHandlerUnlocked(
  { path, old_string, new_string, expected_replacements }: EditHandlerArgs,
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

  const { contentType, sizeBytes } = statResult.value;
  const mimeType = stripMimeParameters(contentType);
  // Frame source files carry the frame content type but hold plain TSX text.
  const isFrameSource = isInteractiveContentType(mimeType);

  if (!isFrameSource && !isReadableAsText(mimeType)) {
    return new Err(
      new MCPError(
        `\`${path}\` is a binary file (${mimeType}) and cannot be edited as text.`,
        { tracked: false }
      )
    );
  }

  const maxBytes = isFrameSource
    ? FRAME_SOURCE_MAX_BYTES
    : CREATE_CONTENT_MAX_BYTES;
  if (sizeBytes > maxBytes) {
    return new Err(
      new MCPError(
        `\`${path}\` exceeds the ${maxBytes / 1024} KB limit and cannot be edited with this tool.`,
        { tracked: false }
      )
    );
  }

  const readResult = await dustFs.readBuffer(path);
  if (readResult.isErr()) {
    return new Err(new MCPError(readResult.error.message, { tracked: false }));
  }
  if (readResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  const currentContent = readResult.value.toString("utf8");

  const { updatedContent, occurrences } = getUpdatedContentAndOccurrences({
    oldString: old_string,
    newString: new_string,
    currentContent,
  });

  if (occurrences === 0) {
    return new Err(
      new MCPError(
        `String "${old_string}" not found in file. The file may have changed since you last ` +
          `read it: re-read it with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` ` +
          "and retry with the exact current text. Never resend the whole file content.",
        {
          tracked: false,
        }
      )
    );
  }

  const expectedReplacements = expected_replacements ?? 1;
  if (occurrences !== expectedReplacements) {
    return new Err(
      new MCPError(
        `Expected ${expectedReplacements} replacements, but found ${occurrences} occurrences`,
        { tracked: false }
      )
    );
  }

  const updatedBuffer = Buffer.from(updatedContent, "utf8");
  if (updatedBuffer.byteLength > maxBytes) {
    return new Err(
      new MCPError(`Edited content exceeds the ${maxBytes / 1024} KB limit.`, {
        tracked: false,
      })
    );
  }

  // Reusing the stored content type keeps a Frame source frame-typed on the mount.
  const writeResult = await dustFs.write(path, updatedBuffer, contentType);
  if (writeResult.isErr()) {
    const err = writeResult.error;
    switch (err.code) {
      case "legacy_path":
      case "unauthorized":
        return new Err(new MCPError(err.message, { tracked: false }));

      case "invalid_path":
        return new Err(
          new MCPError(`Invalid path: \`${path}\`.`, { tracked: false })
        );

      default:
        return new Err(
          new MCPError(`Failed to write file \`${path}\`: ${err.message}`)
        );
    }
  }

  let text = `Updated \`${path}\`: made ${occurrences} replacement${pluralize(occurrences)}.`;

  if (isFrameSource) {
    text += ` ${frameSourceUpdatedNotice()}`;
  }

  return new Ok([{ type: "text", text }]);
}

export async function editHandler(
  args: EditHandlerArgs,
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const normalizedPath = DustFileSystem.normalizeScopedPath(args.path);
  if (!normalizedPath) {
    return new Err(
      new MCPError(`Invalid path: \`${args.path}\`.`, { tracked: false })
    );
  }

  try {
    return await executeWithLock(
      `file:edit:${extra.auth.getNonNullableWorkspace().sId}:${normalizedPath}`,
      () => editHandlerUnlocked(args, extra),
      FILE_EDIT_LOCK_ACQUISITION_TIMEOUT_MS,
      {
        lockTtlMs: FILE_EDIT_LOCK_TTL_MS,
        retryIntervalMs: FILE_EDIT_LOCK_RETRY_INTERVAL_MS,
      }
    );
  } catch (error) {
    if (isLockAcquisitionTimeoutError(error)) {
      return new Err(
        new MCPError(
          `Another edit is still in progress for \`${normalizedPath}\`. Re-read the file and retry.`,
          { tracked: false }
        )
      );
    }

    throw error;
  }
}
