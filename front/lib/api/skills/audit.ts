import type { AuditAction } from "@app/lib/api/audit/workos_audit";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";

export function emitSkillAuditLogEvent(
  auth: Authenticator,
  {
    action,
    skill,
    metadata = {},
  }: {
    action: AuditAction;
    skill: SkillResource;
    metadata?: Record<string, string>;
  }
): void {
  void emitAuditLogEvent({
    auth,
    action,
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("skill", skill),
    ],
    context: getAuditLogContext(auth),
    metadata: { skill_name: skill.name, ...metadata },
  });
}
