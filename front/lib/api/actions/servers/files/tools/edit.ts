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
  getLiveSessionPath,
  isReadableAsText,
} from "@app/lib/api/actions/servers/files/tools/utils";
import { FRAME_SOURCE_MAX_BYTES } from "@app/lib/api/actions/servers/interactive_content/metadata";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { editAgentDocument } from "@app/lib/api/files/dfm_agent_documents";
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import {
  contentTypeFromFileName,
  isInteractiveContentType,
  isMarkdownContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { pluralize } from "@app/types/shared/utils/string_utils";

/**
 * @cc [owner:PopDaph,label:product;concurrency] files-edit-live-markdown
 * A Markdown file a live session holds MUST be edited through `editAgentDocument`, never by
 * writing the file, with its rules and refusals; a collab server failure MUST refuse the edit
 * rather than write the file. Without a session, or for a file `editAgentDocument` cannot read
 * by its name, it MUST return null so the file is edited as before. A session opening between
 * the check and the write is not covered until the new file system marks open files in their
 * metadata.
 */
async function editLiveMarkdown(
  auth: Authenticator,
  dustFs: DustFileSystem,
  {
    path,
    ...edit
  }: {
    path: string;
    oldString: string;
    newString: string;
    expectedReplacements: number;
  }
): Promise<ToolHandlerResult | null> {
  // Checked here as well as in `editAgentDocument`: a closed file keeps the plain string replace,
  // not `edit_document`'s rules.
  // TODO(co-edition): a session opening between this check and the plain write loads the file
  // before the write, and its checkpoints then conflict with it. Fixed once the new file system
  // marks open files in their metadata.
  const live = await getLiveSessionPath(auth, path);
  if (live.isErr()) {
    return live;
  }
  const canonicalPath = live.value;
  if (
    canonicalPath === null ||
    contentTypeFromFileName(canonicalPath) !== "text/markdown"
  ) {
    return null;
  }
  // Through `edit_document`'s path, which writes the session or, if it closed meanwhile, the file.
  const edited = await editAgentDocument(auth, dustFs, {
    scopedPath: canonicalPath,
    ...edit,
  });
  if (edited.isErr()) {
    return new Err(
      new MCPError(edited.error.message, {
        tracked: edited.error.code === "storage_failed",
      })
    );
  }
  const { replacements } = edited.value;
  return new Ok([
    {
      type: "text",
      text: `Updated \`${path}\`, open in a live session: made ${replacements} replacement${pluralize(replacements)}.`,
    },
  ]);
}

export async function editHandler(
  {
    path,
    old_string,
    new_string,
    expected_replacements,
  }: {
    path: string;
    old_string: string;
    new_string: string;
    expected_replacements?: number;
  },
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

  // A Markdown document open in a live session is edited there, as `edit_document` does: open
  // editors see the change, and the session's next checkpoint does not conflict with the file.
  if (isMarkdownContentType(mimeType)) {
    const live = await editLiveMarkdown(auth, dustFs, {
      path,
      oldString: old_string,
      newString: new_string,
      expectedReplacements: expected_replacements ?? 1,
    });
    if (live !== null) {
      return live;
    }
  }

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
