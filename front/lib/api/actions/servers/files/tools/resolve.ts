import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DustFileSystem,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
import { FileResource } from "@app/lib/resources/file_resource";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Convert a raw GCS mountFilePath back to the canonical scoped path the agent sees.
 *
 * w/{wId}/conversations/{cId}/files/{rel} -> conversation-{cId}/{rel}
 * w/{wId}/projects/{pId}/files/{rel}      -> pod-{pId}/{rel}   (legacy prefix)
 * w/{wId}/pods/{pId}/files/{rel}          -> pod-{pId}/{rel}
 */
function gcsPathToCanonical(
  workspace: LightWorkspaceType,
  mountFilePath: string
): string | null {
  const base = `w/${workspace.sId}/`;
  if (!mountFilePath.startsWith(base)) {
    return null;
  }

  const rest = mountFilePath.slice(base.length);

  const conv = rest.match(/^conversations\/([^/]+)\/files\/(.+)$/);
  if (conv) {
    return `${SCOPED_PREFIX_CONVERSATION}${conv[1]}/${conv[2]}`;
  }

  const pod =
    rest.match(/^pods\/([^/]+)\/files\/(.+)$/) ??
    rest.match(/^projects\/([^/]+)\/files\/(.+)$/);
  if (pod) {
    return `${SCOPED_PREFIX_POD}${pod[1]}/${pod[2]}`;
  }

  return null;
}

export async function resolveHandler(
  { file_id }: { file_id: string },
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversation = extra.agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
  }

  const file = await FileResource.fetchById(extra.auth, file_id);
  if (!file) {
    return new Err(
      new MCPError(`File not found: \`${file_id}\`.`, { tracked: false })
    );
  }

  if (!file.mountFilePath) {
    return new Err(
      new MCPError(
        `File \`${file_id}\` is not accessible through the file system.`,
        { tracked: false }
      )
    );
  }

  const workspace = extra.auth.getNonNullableWorkspace();
  const canonicalPath = gcsPathToCanonical(workspace, file.mountFilePath);
  if (!canonicalPath) {
    return new Err(
      new MCPError(
        `File \`${file_id}\` is not accessible through the file system (use case: ${file.useCase}).`,
        { tracked: false }
      )
    );
  }

  // Verify the caller actually has access to the resolved path. DustFileSystem.forConversation
  // only mounts the pod scope when the conversation belongs to that pod and the caller has read
  // access, so stat() implicitly enforces the same ownership + permission checks the old
  // hand-rolled code did (conversationId match, spaceId match, space.canRead).
  const fsResult = await DustFileSystem.forConversation(
    extra.auth,
    conversation
  );
  if (fsResult.isErr()) {
    return new Err(new MCPError(fsResult.error.message, { tracked: false }));
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
