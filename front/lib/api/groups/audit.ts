import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { UserType } from "@app/types/user";

// Bounds the fire-and-forget WorkOS calls: memberIds payloads are unbounded, so a large group
// update could otherwise burst hundreds of concurrent requests.
const EMIT_CONCURRENCY = 8;

export function emitGroupMemberAuditLogs(
  auth: Authenticator,
  group: GroupResource,
  {
    addedUsers,
    removedUsers,
  }: { addedUsers: UserType[]; removedUsers: UserType[] }
): void {
  void concurrentExecutor(
    addedUsers,
    async (user) =>
      emitAuditLogEvent({
        auth,
        action: "group.member_added",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("group", group),
          buildAuditLogTarget("user", { sId: user.sId, name: user.fullName }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          group_name: group.name,
          user_email: user.email,
        },
      }),
    { concurrency: EMIT_CONCURRENCY }
  );
  void concurrentExecutor(
    removedUsers,
    async (user) =>
      emitAuditLogEvent({
        auth,
        action: "group.member_removed",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("group", group),
          buildAuditLogTarget("user", { sId: user.sId, name: user.fullName }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          group_name: group.name,
          user_email: user.email,
        },
      }),
    { concurrency: EMIT_CONCURRENCY }
  );
}
