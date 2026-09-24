import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { FileResource } from "@app/lib/resources/file_resource";
import { getFileDisplayName } from "@app/types/files";

/**
 * Cache-bust token for the interactive-content side panel.
 *
 * The panel keys refresh on `fileId@updatedAt`. Prefer the active Frames v2
 * publication id (changes on every publish) over `FileResource.updatedAtMs`,
 * which may not move when only sandbox sources change.
 */
export function interactiveContentRevision(
  fileResource: FileResource,
  override?: string
): string {
  if (override !== undefined) {
    return override;
  }

  return (
    fileResource.useCaseMetadata?.activePublicationId ??
    fileResource.updatedAtMs.toString()
  );
}

/**
 * Builds a progress notification for interactive content file operations.
 *
 * Pass `contentRevision` when the caller needs a forced panel refresh even if
 * the File row's updatedAt / active publication did not change (e.g. open_frame).
 */
export function buildInteractiveContentFileNotification(
  progressToken: string | number,
  fileResource: FileResource,
  label: string,
  { contentRevision }: { contentRevision?: string } = {}
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
            updatedAt: interactiveContentRevision(
              fileResource,
              contentRevision
            ),
          },
        },
      },
    },
  };
}
