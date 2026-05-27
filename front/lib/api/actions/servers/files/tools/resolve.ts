import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
import { FileResource } from "@app/lib/resources/file_resource";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Convert a raw GCS mountFilePath back to the canonical scoped path the agent sees.
 *
 * w/{wId}/conversations/{cId}/files/{rel} -> conversation-{cId}/{rel}
 * w/{wId}/projects/{pId}/files/{rel}      -> pod-{pId}/{rel}   (legacy prefix)
 * w/{wId}/pods/{pId}/files/{rel}          -> pod-{pId}/{rel}
 */
function gcsPathToCanonical(
  mountFilePath: string,
  workspaceId: string
): string | null {
  const base = `w/${workspaceId}/`;
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

  const workspaceId = extra.auth.getNonNullableWorkspace().sId;
  const canonicalPath = gcsPathToCanonical(file.mountFilePath, workspaceId);
  if (!canonicalPath) {
    return new Err(
      new MCPError(
        `File \`${file_id}\` is not accessible through the file system (use case: ${file.useCase}).`,
        { tracked: false }
      )
    );
  }

  return new Ok([{ type: "text", text: canonicalPath }]);
}
