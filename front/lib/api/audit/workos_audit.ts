import type { NextApiRequest } from "next";

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
import type { LightWorkspaceType } from "@app/types/user";

type AuditAction =
  | "space.created"
  | "space.deleted"
  | "space.permissions_updated"
  | "file.uploaded"
  | "file.downloaded"
  | "table.deleted"
  | "conversation.mention_approved"
  | "conversation.mention_rejected"
  | "integration.connected"
  | "integration.disconnected";

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
 * Emits an audit log event directly with a workspace, bypassing Authenticator.
 * Used in routes where no Authenticator is available (e.g. login, logout, signup)
 * or in system contexts (e.g. Temporal activities).
 * Does not throw errors — audit log failures should not break the main operation.
 */
export async function emitAuditLogEventDirect({
  workspace,
  action,
  actor,
  targets,
  context,
  metadata,
}: {
  workspace: LightWorkspaceType;
  action: AuditAction;
  actor: AuditLogActor;
  targets: AuditLogTarget[];
  context: AuditLogContext;
  metadata?: Record<string, string | number | boolean>;
}): Promise<void> {
  try {
    if (!workspace.workOSOrganizationId) {
      return;
    }

    await createAuditLogEvent({
      workspace,
      event: {
        action,
        actor,
        targets,
        context,
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

/**
 * Builds the audit log context with the client IP address.
 * When called with a request object, extracts the IP from headers.
 * Otherwise returns the IP from auth or "internal" as the location.
 */
export function getAuditLogContext(
  auth: Authenticator,
  req?: NextApiRequest
): AuditLogContext {
  if (req) {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded)
          .split(",")[0]
          .trim()
      : req.socket?.remoteAddress;
    return { location: ip ?? "internal" };
  }
  return { location: auth.clientIp() ?? "internal" };
}
