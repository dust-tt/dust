import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { UserType } from "@app/types/user";

// Bounds the fire-and-forget WorkOS calls: memberIds payloads are unbounded, so a large group
// update could otherwise burst hundreds of concurrent requests.
const EMIT_CONCURRENCY = 8;

export type ManualGroupLifecycle =
  | {
      kind: "created";
      group: GroupResource;
      memberCount: number;
      managerCount: number;
    }
  | { kind: "deleted"; group: GroupResource; memberCount: number }
  | {
      kind: "name_updated";
      group: GroupResource;
      previousName: string | null;
    };

export function emitManualGroupLifecycleAuditLog(
  auth: Authenticator,
  lifecycle: ManualGroupLifecycle
): void {
  switch (lifecycle.kind) {
    case "created":
      void emitAuditLogEvent({
        auth,
        action: "group.created",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("group", lifecycle.group),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          group_name: lifecycle.group.name,
          member_count: String(lifecycle.memberCount),
          manager_count: String(lifecycle.managerCount),
        },
      });
      return;
    case "deleted":
      void emitAuditLogEvent({
        auth,
        action: "group.deleted",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("group", lifecycle.group),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          group_name: lifecycle.group.name,
          member_count: String(lifecycle.memberCount),
        },
      });
      return;
    case "name_updated":
      if (lifecycle.previousName === null) {
        return;
      }
      void emitAuditLogEvent({
        auth,
        action: "group.name_updated",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("group", lifecycle.group),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          previous_name: lifecycle.previousName,
          new_name: lifecycle.group.name,
        },
      });
      return;
    default:
      assertNever(lifecycle);
  }
}

export function emitGroupManagerAuditLog(
  auth: Authenticator,
  group: GroupResource,
  {
    addedUsers,
    removedUsers,
  }: { addedUsers: UserType[]; removedUsers: UserType[] }
): void {
  if (addedUsers.length === 0 && removedUsers.length === 0) {
    return;
  }
  void emitAuditLogEvent({
    auth,
    action: "group.managers_updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("group", group),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      added_manager_ids: addedUsers.map((user) => user.sId).join(","),
      removed_manager_ids: removedUsers.map((user) => user.sId).join(","),
    },
  });
}

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
