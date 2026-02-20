import type { NextApiRequest } from "next";

import type { Authenticator } from "@app/lib/auth";
import type {
  AuditLogActor,
  AuditLogContext,
  AuditLogTarget,
} from "@app/lib/api/workos/organization";
import { createAuditLogEvent } from "@app/lib/api/workos/organization";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types";

export type EmitAuditLogEventParams = {
  workspace: LightWorkspaceType;
  action: string;
  actor: AuditLogActor;
  targets: AuditLogTarget[];
  context: AuditLogContext;
  metadata?: Record<string, string | number | boolean>;
};

/**
 * Emits an audit log event to WorkOS if the workspace has audit logs enabled.
 * Silently skips if the feature is not enabled for the workspace.
 * Does not throw errors - audit log failures should not break the main operation.
 */
export async function emitAuditLogEvent({
  workspace,
  action,
  actor,
  targets,
  context,
  metadata,
}: EmitAuditLogEventParams): Promise<void> {
  try {
    const subscription =
      await SubscriptionResource.fetchLastByWorkspace(workspace);
    if (
      !subscription ||
      !subscription.getPlan().limits.users.isAuditLogsAllowed
    ) {
      return;
    }

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
      normalizeError(error),
      "Failed to emit audit log event"
    );
  }
}

/**
 * Builds the audit actor from an Authenticator.
 * Uses getNonNullableUser() since audit events are only emitted
 * in authenticated routes where the user is guaranteed to exist.
 */
export function buildAuditActor(auth: Authenticator): AuditLogActor {
  const user = auth.getNonNullableUser();
  return {
    type: "user",
    id: user.sId,
    name: user.fullName() ?? undefined,
  };
}

/**
 * Builds a workspace audit target.
 */
export function buildWorkspaceTarget(
  workspace: LightWorkspaceType
): AuditLogTarget {
  return { type: "workspace", id: workspace.sId, name: workspace.name };
}

/**
 * Builds the audit log context with the client IP address.
 * Uses the IP stored on the Authenticator (set by auth wrappers).
 * When called outside auth-wrapped routes (e.g. login), pass `req` for direct extraction.
 */
export function getAuditLogContext(
  auth: Authenticator,
  req?: NextApiRequest
): AuditLogContext {
  if (req) {
    // For routes outside auth wrappers (login/logout) where clientIp isn't set.
    const forwarded = req.headers["x-forwarded-for"];
    const ip = forwarded
      ? (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim()
      : req.socket?.remoteAddress;
    return { location: ip ?? "internal" };
  }
  return { location: auth.clientIp() ?? "internal" };
}
