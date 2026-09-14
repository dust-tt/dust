import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { FileResource } from "@app/lib/resources/file_resource";
import { getFileDisplayName } from "@app/types/files";

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
            title: getFileDisplayName(fileResource),
            updatedAt: fileResource.updatedAtMs.toString(),
          },
        },
      },
    },
  };
}
