import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { CREATE_CONTENT_MAX_BYTES } from "@app/lib/api/actions/servers/files/metadata";
import { DustFileSystem } from "@app/lib/api/file_system";
import { isAllSupportedFileContentType } from "@app/types/files";
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
  const conversation = agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
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

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(new MCPError(fsResult.error.message, { tracked: false }));
  }

  const fs = fsResult.value;

  // Check existence before writing so we can report "Created" vs "Updated".
  const statResult = await fs.stat(path);
  const exists = statResult.isOk() && statResult.value !== null;

  const writeResult = await fs.write(path, contentBuffer, content_type);
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
      text: `${verb} \`${path}\` (${content_type}, ${sizeKb} KB)`,
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
