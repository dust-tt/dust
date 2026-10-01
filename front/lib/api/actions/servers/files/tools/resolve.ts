import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import { readAuthorizedMountPath } from "@app/lib/api/files/authorization";
import { FileResource } from "@app/lib/resources/file_resource";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:frankaloia,label:security] resolve-hides-foreign-mount
 * When the caller cannot read the file's mount, the error MUST NOT include its path, file
 * name, conversation id, or pod id. The path MUST be returned only after
 * `readAuthorizedMountPath` yields `ok`.
 */
export async function resolveHandler(
  { file_id }: { file_id: string },
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation(extra);
  if (conversationRes.isErr()) {
    return conversationRes;
  }

  const file = await FileResource.fetchById(extra.auth, file_id);
  if (!file) {
    return new Err(
      new MCPError(`File not found: \`${file_id}\`.`, { tracked: false })
    );
  }

  const mount = await readAuthorizedMountPath(extra.auth, file);
  if (mount.status === "denied") {
    return new Err(
      new MCPError(`File not found: \`${file_id}\`.`, { tracked: false })
    );
  }
  if (mount.status === "unmounted") {
    return new Err(
      new MCPError(
        `File \`${file_id}\` is not accessible through the file system.`,
        { tracked: false }
      )
    );
  }
  const canonicalPath = mount.path;

  const fsResult = await getDustFileSystemForAgentLoop(
    extra.auth,
    conversationRes.value,
    scopedPathsFromArgs(canonicalPath)
  );
  if (fsResult.isErr()) {
    return fsResult;
  }
  const dustFs = fsResult.value;

  const statResult = await dustFs.stat(canonicalPath);
  if (statResult.isErr()) {
    return new Err(new MCPError(statResult.error.message, { tracked: false }));
  }
  if (!statResult.value) {
    return new Err(
      new MCPError(
        `File \`${file_id}\` is not accessible through the file system.`,
        { tracked: false }
      )
    );
  }

  return new Ok([{ type: "text", text: canonicalPath }]);
}
