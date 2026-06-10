import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { getPodFilesRoute } from "@app/lib/utils/router";

/**
 * For frames that live in a Pod (`project_context` files), returns a notice pointing the agent at
 * the Pod's Files tab — the most precise UI location for such frames (there is no per-file deep
 * link on the Pod page). Returns the empty string for other files.
 */
export function getPodFrameLinkNotice(
  auth: Authenticator,
  fileResource: FileResource
): string {
  const { useCase, useCaseMetadata } = fileResource;
  if (useCase !== "project_context" || !useCaseMetadata?.spaceId) {
    return "";
  }

  const owner = auth.getNonNullableWorkspace();
  const url = `${config.getAppUrl()}${getPodFilesRoute(owner.sId, useCaseMetadata.spaceId)}`;

  return `\n\nThis frame lives in a Pod; when linking to it in your response, use ${url}`;
}

/**
 * Builds a progress notification for interactive content file operations.
 */
export function buildInteractiveContentFileNotification(
  progressToken: string | number,
  fileResource: FileResource,
  label: string
): MCPProgressNotificationType {
  return {
    method: "notifications/progress",
    params: {
      progress: 1,
      total: 1,
      progressToken,
      _meta: {
        data: {
          label,
          output: {
            type: "interactive_content_file",
            fileId: fileResource.sId,
            mimeType: fileResource.contentType,
            title: fileResource.fileName,
            updatedAt: fileResource.updatedAtMs.toString(),
          },
        },
      },
    },
  };
}
