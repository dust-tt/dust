import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";

export function emitSpaceNameUpdatedAuditLog(
  auth: Authenticator,
  space: SpaceResource,
  previousName: string
): void {
  void emitAuditLogEvent({
    auth,
    action: "space.name_updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("space", space),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      previous_name: previousName,
      new_name: space.name,
      space_kind: space.kind,
    },
  });
}
