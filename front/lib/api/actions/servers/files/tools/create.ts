import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  CREATE_CONTENT_MAX_BYTES,
  FILES_EDIT_ACTION_NAME,
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
} from "@app/lib/api/actions/servers/files/tools/utils";
import { FRAME_SOURCE_MAX_BYTES } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { editAgentDocument } from "@app/lib/api/files/dfm_agent_documents";
import { getFilePreviewDirectiveInstruction } from "@app/lib/markdown/file_preview";
import {
  contentTypeFromFileName,
  isAllSupportedFileContentType,
  isInteractiveContentType,
  isMarkdownContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

/**
 * @cc [owner:PopDaph,label:product;concurrency] files-create-live-markdown
 * An existing Markdown file a live session holds MUST NOT be overwritten: an empty body MUST be
 * filled through `editAgentDocument`, any other call MUST be refused, pointing to the files edit
 * tool, and a collab server failure MUST refuse it too. A session opening between the check and
 * the write is not covered until the new file system marks open files in their metadata.
 */
export async function createHandler(
  {
    path,
    content,
    content_type,
  }: { path: string; content: string; content_type: string },
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

  // Check existence before writing so we can report "Created" vs "Updated".
  const statResult = await dustFs.stat(path);
  const exists = statResult.isOk() && statResult.value !== null;

  let isFrameSourceOverwrite = false;
  let writeContentType = content_type;

  if (statResult.isOk() && statResult.value !== null) {
    const existingMimeType = stripMimeParameters(statResult.value.contentType);
    if (isInteractiveContentType(existingMimeType)) {
      isFrameSourceOverwrite = true;
      // Keep the frame content type on the mount so the file stays recognized as a Frame.
      writeContentType = statResult.value.contentType;
    }
  }

  // Overwriting a Markdown document open in a live session would skip the people editing it, and
  // the session's next checkpoint would conflict with the file. A failed lookup goes by the name.
  const mayBeOpenMarkdown = statResult.isOk()
    ? statResult.value !== null &&
      isMarkdownContentType(stripMimeParameters(statResult.value.contentType))
    : contentTypeFromFileName(path) === "text/markdown";
  if (mayBeOpenMarkdown) {
    // TODO(co-edition): a session opening between this check and the write below loads the file
    // before the write, and its checkpoints then conflict with it. Fixed once the new file system
    // marks open files in their metadata.
    const live = await getLiveSessionPath(auth, path);
    if (live.isErr()) {
      return live;
    }
    if (live.value !== null) {
      // An empty open document, as people create before asking an agent to write it, is filled
      // through the session: `files__edit` cannot target empty text.
      const filled = await editAgentDocument(auth, dustFs, {
        scopedPath: live.value,
        oldString: "",
        newString: content,
        expectedReplacements: 1,
      });
      if (filled.isOk()) {
        return new Ok([
          {
            type: "text",
            text: `Wrote \`${path}\`, open in a live session.`,
          },
        ]);
      }
      if (
        filled.error.code !== "string_not_found" &&
        filled.error.code !== "not_markdown"
      ) {
        return new Err(
          new MCPError(filled.error.message, {
            tracked: filled.error.code === "storage_failed",
          })
        );
      }
      return new Err(
        new MCPError(
          `\`${path}\` is open in the document editor and cannot be overwritten. Change it with ` +
            `\`${getPrefixedToolName(FILES_SERVER_NAME, FILES_EDIT_ACTION_NAME)}\` instead.`,
          { tracked: false }
        )
      );
    }
  }

  const contentBuffer = Buffer.from(content, "utf8");
  const maxBytes = isFrameSourceOverwrite
    ? FRAME_SOURCE_MAX_BYTES
    : CREATE_CONTENT_MAX_BYTES;
  if (contentBuffer.byteLength > maxBytes) {
    return new Err(
      new MCPError(`Content exceeds the ${maxBytes / 1024} KB limit.`, {
        tracked: false,
      })
    );
  }

  const writeResult = await dustFs.write(path, contentBuffer, writeContentType);
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

  const fileName = path.split("/").pop() ?? path;
  const sizeKb = Math.ceil(contentBuffer.byteLength / 1024);
  const verb = exists ? "Updated" : "Created";

  if (isFrameSourceOverwrite) {
    return new Ok([
      {
        type: "text",
        text: `Updated \`${path}\` (${sizeKb} KB). ${frameSourceUpdatedNotice()}`,
      },
    ]);
  }

  const items: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: ToolGeneratedFilePathType }
  > = [
    {
      type: "text",
      text:
        `${verb} \`${path}\` (${content_type}, ${sizeKb} KB). ` +
        getFilePreviewDirectiveInstruction({
          contentType: content_type,
          path,
          title: fileName,
        }),
    },
  ];

  if (isAllSupportedFileContentType(content_type)) {
    items.push({
      type: "resource",
      resource: {
        text: `${verb} \`${path}\``,
        uri: path,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
        path,
        title: fileName,
        contentType: content_type,
      },
    });
  }

  return new Ok(items);
}
