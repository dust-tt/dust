// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type { MCPProgressNotificationType } from "@dust-tt/client";

import type { FileResource } from "@app/lib/resources/file_resource";

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
  };
}
