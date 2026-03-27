import type {
  AuditLogActor,
  AuditLogContext,
  AuditLogTarget,
} from "@app/lib/api/workos/organization";
import { createAuditLogEvent } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Audit actions will be added here as event emission is implemented per tier.
// Using a union type ensures compile-time safety for action strings.
type AuditAction = never;

export type EmitAuditLogEventParams = {
  auth: Authenticator;
  action: AuditAction;
  targets: AuditLogTarget[];
  context?: AuditLogContext;
  metadata?: Record<string, string | number | boolean>;
};

/**
 * Returns true if audit logs are enabled for the workspace,
 * either via feature flag or plan setting.
 */
export async function isAuditLogsEnabled(
  auth: Authenticator
): Promise<boolean> {
  if (await hasFeatureFlag(auth, "audit_logs")) {
    return true;
  }
  return auth.getNonNullablePlan().isAuditLogsAllowed;
}

/**
 * Emits an audit log event to WorkOS if the workspace has audit logs enabled.
 * Enabled when the feature flag is set OR the plan allows audit logs.
 * Does not throw errors — audit log failures should not break the main operation.
 */
export async function emitAuditLogEvent({
  auth,
  action,
  targets,
  context,
  metadata,
}: EmitAuditLogEventParams): Promise<void> {
  try {
    if (!(await isAuditLogsEnabled(auth))) {
      return;
    }

    const workspace = auth.getNonNullableWorkspace();
    if (!workspace.workOSOrganizationId) {
      return;
    }

    await createAuditLogEvent({
      workspace,
      event: {
        action,
        actor: buildAuditActor(auth),
        targets,
        context: context ?? { location: auth.clientIp() ?? "internal" },
        metadata,
      },
    });
  } catch (error) {
    logger.error(
      {
        ...normalizeError(error),
        auditEvent: { action, targets, metadata },
      },
      "Failed to emit audit log event"
    );
  }
}

/**
 * Builds the audit actor from an Authenticator.
 */
export function buildAuditActor(auth: Authenticator): AuditLogActor {
  const user = auth.getNonNullableUser();
  return {
    type: "user",
    id: user.sId,
    name: user.fullName() ?? undefined,
    metadata: {
      email: user.email,
    },
  };
}

/**
 * Builds a workspace audit target.
 */
export function buildWorkspaceTarget(workspace: {
  sId: string;
  name: string;
}): AuditLogTarget {
  return { type: "workspace", id: workspace.sId, name: workspace.name };
}
