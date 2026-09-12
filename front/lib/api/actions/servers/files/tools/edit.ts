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
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import {
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { createHash } from "crypto";

interface EditSpec {
  old_string: string;
  new_string: string;
  expected_replacements?: number;
}

// Batch failure messages quote the failing `old_string`; cap the quote so a large
// mismatched block does not flood the error message.
const BATCH_ERROR_SNIPPET_MAX_CHARS = 80;

function editSnippet(oldString: string): string {
  if (oldString.length <= BATCH_ERROR_SNIPPET_MAX_CHARS) {
    return oldString;
  }
  return `${oldString.slice(0, BATCH_ERROR_SNIPPET_MAX_CHARS)}…`;
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  const segments = content.split("\n");
  // A trailing newline does not start a new line.
  return content.endsWith("\n") ? segments.length - 1 : segments.length;
}

// Short digest of the written content (line count + sha256 prefix) appended to every
// success message, so agents can cheaply confirm the final file state without re-reading it.
function contentDigest(content: string, buffer: Buffer): string {
  const lineCount = countLines(content);
  const hashPrefix = createHash("sha256")
    .update(buffer)
    .digest("hex")
    .slice(0, 8);
  return `The file is now ${lineCount} line${pluralize(lineCount)} (sha256:${hashPrefix}).`;
}

export async function editHandler(
  {
    path,
    old_string,
    new_string,
    expected_replacements,
    edits,
  }: {
    path: string;
    old_string?: string;
    new_string?: string;
    expected_replacements?: number;
    edits?: EditSpec[];
  },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  let editSpecs: EditSpec[];
  const isBatch = edits !== undefined;
  if (isBatch) {
    if (
      old_string !== undefined ||
      new_string !== undefined ||
      expected_replacements !== undefined
    ) {
      return new Err(
        new MCPError(
          "Pass either `old_string`/`new_string` or `edits`, not both. The file was not modified.",
          { tracked: false }
        )
      );
    }
    if (edits.length === 0) {
      return new Err(
        new MCPError("`edits` must contain at least one edit.", {
          tracked: false,
        })
      );
    }
    editSpecs = edits;
  } else {
    if (old_string === undefined || new_string === undefined) {
      return new Err(
        new MCPError(
          "Pass `old_string` and `new_string`, or an `edits` array.",
          { tracked: false }
        )
      );
    }
    editSpecs = [{ old_string, new_string, expected_replacements }];
  }

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

  // Apply every edit in memory, in order, each matching against the result of the
  // previous ones. The file is written only if every edit matches (all-or-nothing).
  let updatedContent = currentContent;
  let totalReplacements = 0;
  for (const [editIndex, edit] of editSpecs.entries()) {
    const { updatedContent: nextContent, occurrences } =
      getUpdatedContentAndOccurrences({
        oldString: edit.old_string,
        newString: edit.new_string,
        currentContent: updatedContent,
      });

    if (occurrences === 0) {
      const catToolName = getPrefixedToolName(
        FILES_SERVER_NAME,
        FILES_CAT_ACTION_NAME
      );
      return new Err(
        new MCPError(
          isBatch
            ? `Edit ${editIndex + 1} of ${editSpecs.length} failed: string "${editSnippet(edit.old_string)}" not found. ` +
                "The batch is all-or-nothing: zero edits were applied and the file was not modified. " +
                "Each edit matches against the file as transformed by the previous edits in the batch. " +
                `Re-read the file with \`${catToolName}\` and retry the full batch with the exact current text.`
            : `String "${edit.old_string}" not found in file. The file may have changed since you last ` +
                `read it: re-read it with \`${catToolName}\` ` +
                "and retry with the exact current text. Never resend the whole file content.",
          {
            tracked: false,
          }
        )
      );
    }

    const expectedReplacements = edit.expected_replacements ?? 1;
    if (occurrences !== expectedReplacements) {
      return new Err(
        new MCPError(
          isBatch
            ? `Edit ${editIndex + 1} of ${editSpecs.length} failed: expected ${expectedReplacements} ` +
                `replacement${pluralize(expectedReplacements)}, but found ${occurrences} ` +
                `occurrence${pluralize(occurrences)}. The batch is all-or-nothing: zero edits were ` +
                "applied and the file was not modified."
            : `Expected ${expectedReplacements} replacements, but found ${occurrences} occurrences`,
          { tracked: false }
        )
      );
    }

    updatedContent = nextContent;
    totalReplacements += occurrences;
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

  const acrossEdits = isBatch
    ? ` across ${editSpecs.length} edit${pluralize(editSpecs.length)}`
    : "";
  let text =
    `Updated \`${path}\`: made ${totalReplacements} replacement${pluralize(totalReplacements)}${acrossEdits}. ` +
    contentDigest(updatedContent, updatedBuffer);

  if (isFrameSource) {
    text += ` ${frameSourceUpdatedNotice()}`;
  }

  return new Ok([{ type: "text", text }]);
}
