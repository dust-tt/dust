import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { FileResource } from "@app/lib/resources/file_resource";
import { getFileDisplayName } from "@app/types/files";

/**
 * Builds a progress notification for interactive content file operations.
 *
 * Panel refresh keys on `fileId@updatedAt`. Prefer (in order):
 * - `contentRevision` when the caller must force a remount (e.g. open_frame)
 * - active Frames v2 publication id
 * - File.updatedAtMs
 *
 * Pass `autoOpen: false` for background publishes that should refresh an already
 * open Frame panel but not steal focus from another panel (e.g. file explorer).
 */
export function buildInteractiveContentFileNotification(
  progressToken: string | number,
  fileResource: FileResource,
  label: string,
  {
    contentRevision,
    autoOpen,
  }: { contentRevision?: string; autoOpen?: boolean } = {}
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
            updatedAt:
              contentRevision ??
              fileResource.useCaseMetadata?.activePublicationId ??
              fileResource.updatedAtMs.toString(),
            ...(autoOpen === false ? { autoOpen: false } : {}),
          },
        },
      },
    },
  };
}
