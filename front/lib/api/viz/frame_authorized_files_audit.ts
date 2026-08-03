import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type {
  ComputedAuthorizedFileAccess,
  FileShareScope,
} from "@app/types/files";
import { getAuthorizedFileRefLabel } from "@app/types/files";

export function emitFrameAuthorizedFilesUpdatedAuditLog(
  auth: Authenticator,
  frameFile: FileResource,
  computed: ComputedAuthorizedFileAccess,
  shareScope: FileShareScope
): void {
  void emitAuditLogEvent({
    auth,
    action: "frame.authorized_files_updated",
    targets: [buildAuditLogTarget("workspace", auth.getNonNullableWorkspace())],
    context: getAuditLogContext(auth),
    metadata: {
      frame_file_id: frameFile.sId,
      frame_file_name: frameFile.fileName,
      share_scope: shareScope,
      authorized_ref_count: String(computed.refs.length),
      authorized_refs: computed.refs.map(getAuthorizedFileRefLabel).join(", "),
      unverifiable_ref_count: String(computed.unverifiableRefs?.length ?? 0),
      frame_content_hash: computed.frameContentHash,
    },
  });
}
