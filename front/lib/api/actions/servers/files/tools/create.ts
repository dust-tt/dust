import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { CREATE_CONTENT_MAX_BYTES } from "@app/lib/api/actions/servers/files/metadata";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import {
  frameFileCreateRejectedError,
  frameFileEditRejectedError,
} from "@app/lib/api/actions/servers/files/tools/utils";
import {
  isAllSupportedFileContentType,
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export async function createHandler(
  {
    path,
    content,
    content_type,
  }: { path: string; content: string; content_type: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ agentLoopContext });
  if (conversationRes.isErr()) {
    return conversationRes;
  }

  const contentBuffer = Buffer.from(content, "utf8");
  if (contentBuffer.byteLength > CREATE_CONTENT_MAX_BYTES) {
    return new Err(
      new MCPError(
        `Content exceeds the ${CREATE_CONTENT_MAX_BYTES / 1024} KB limit.`,
        { tracked: false }
      )
    );
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

  const incomingMimeType = stripMimeParameters(content_type);
  if (isInteractiveContentType(incomingMimeType)) {
    return new Err(frameFileCreateRejectedError());
  }

  // Check existence before writing so we can report "Created" vs "Updated".
  const statResult = await dustFs.stat(path);
  const exists = statResult.isOk() && statResult.value !== null;

  if (statResult.isOk() && statResult.value !== null) {
    const existingMimeType = stripMimeParameters(statResult.value.contentType);
    if (isInteractiveContentType(existingMimeType)) {
      return new Err(frameFileEditRejectedError());
    }
  }

  const writeResult = await dustFs.write(path, contentBuffer, content_type);
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

  const items: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: ToolGeneratedFilePathType }
  > = [
    {
      type: "text",
      text: `${verb} \`${path}\` (${content_type}, ${sizeKb} KB). The user is presented with an attachment to download the file, do not attempt to generate a link to it.`,
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
