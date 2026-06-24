import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import { uploadFileFromUrlToFileSystem } from "@app/lib/api/file_system/upload_from_url";
import { getFilePreviewDirectiveInstruction } from "@app/lib/markdown/file_preview";
import { isAllSupportedFileContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export async function uploadFromUrlHandler(
  {
    path,
    url,
    content_type,
  }: { path: string; url: string; content_type?: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ agentLoopContext });
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

  const uploadResult = await uploadFileFromUrlToFileSystem(fsResult.value, {
    path,
    url,
    contentType: content_type,
  });

  if (uploadResult.isErr()) {
    return new Err(
      new MCPError(uploadResult.error.message, { tracked: false })
    );
  }

  const { contentType, sizeBytes, existed } = uploadResult.value;
  const fileName = path.split("/").pop() ?? path;
  const sizeKb = Math.ceil(sizeBytes / 1024);
  const verb = existed ? "Updated" : "Created";

  const items: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: ToolGeneratedFilePathType }
  > = [
    {
      type: "text",
      text:
        `${verb} \`${path}\` from URL (${contentType}, ${sizeKb} KB). ` +
        getFilePreviewDirectiveInstruction({
          contentType,
          path,
          title: fileName,
        }),
    },
  ];

  if (isAllSupportedFileContentType(contentType)) {
    items.push({
      type: "resource",
      resource: {
        text: `${verb} \`${path}\` from URL`,
        uri: path,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
        path,
        title: fileName,
        contentType,
      },
    });
  }

  return new Ok(items);
}
