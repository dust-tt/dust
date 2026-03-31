import type {
  AuditLogActor,
  AuditLogContext,
  AuditLogTarget,
} from "@app/lib/api/workos/organization";
import { createAuditLogEvent } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { getClientIp } from "@app/lib/utils/request";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

type AuditAction =
  // Existing Tier 1 events.
  | "user.login"
  | "user.logout"
  | "membership.created"
  | "membership.revoked"
  | "member.invited"
  | "sso.connection_deleted"
  | "domain.removed"
  | "dsync.connection_deleted"
  | "workspace.deleted"
  // Authentication & Admin.
  | "user.login_failed"
  | "user.identity_merged"
  | "user.relocated"
  // API Keys & Secrets.
  | "api_key.created"
  | "api_key.revoked"
  | "api_key.updated"
  // Membership & Invitations.
  | "membership.role_updated"
  | "membership.origin_updated"
  | "invitation.revoked"
  | "invitation.role_updated"
  | "member.bulk_invited"
  | "member.bulk_revoked"
  // Domains & SSO.
  | "domain.verified"
  | "domain.verification_failed"
  // OAuth & Credentials.
  | "oauth.initiated"
  | "oauth.authorized"
  | "credentials.created"
  // Projects.
  | "project.joined"
  | "project.left"
  // SCIM / Directory Sync.
  | "scim.user_provisioned"
  | "scim.user_updated"
  | "scim.user_deprovisioned"
  | "scim.group_created"
  | "scim.group_deleted"
  | "scim.group_user_added"
  | "scim.group_user_removed"
  // Agent & Tool Execution.
  | "agent.executed"
  | "tool.executed"
  // Triggers.
  | "trigger.fired"
  | "trigger.email_received"
  // Agent lifecycle.
  | "agent.created"
  | "agent.updated"
  | "agent.archived"
  | "agent.restored"
  | "agent.scope_changed"
  // Spaces.
  | "space.created"
  | "space.deleted"
  | "space.permissions_updated"
  // Data Sources.
  | "datasource.created"
  | "datasource.updated"
  | "datasource.deleted"
  | "datasource.deleted_admin";

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

    const [subscription, featureFlags] = await Promise.all([
      SubscriptionResource.fetchLastByWorkspace(workspace),
      FeatureFlagResource.listForWorkspace(workspace),
    ]);

    const hasAuditFlag = featureFlags.some((f) => f.name === "audit_logs");
    if (
      !hasAuditFlag &&
      (!subscription || !subscription.getPlan().isAuditLogsAllowed)
    ) {
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
 * Uses the authenticated user when available, falls back to the API key.
 */
export function buildAuditActor(auth: Authenticator): AuditLogActor {
  const user = auth.user();
  if (user) {
    return {
      type: "user",
      id: user.sId,
      name: user.fullName() ?? undefined,
      metadata: {
        email: user.email,
      },
    };
  }

  const key = auth.key();
  if (key) {
    return {
      type: "api_key",
      id: String(key.id),
      name: key.name,
    };
  }

  return {
    type: "system",
    id: "unknown",
  };
}

type AuditTargetType =
  | "workspace"
  | "user"
  | "agent"
  | "space"
  | "data_source"
  | "tool"
  | "trigger"
  | "api_key"
  | "invitation"
  | "group";

/**
 * Builds a typed audit log target.
 */
export function buildAuditLogTarget(
  type: AuditTargetType,
  resource: { sId: string; name: string }
): AuditLogTarget {
  return { type, id: resource.sId, name: resource.name };
}

/**
 * Derives the origin of an audit event from the Authenticator.
 * - "web": user-initiated via browser (user present, client IP available)
 * - "api": API-key-initiated (key present)
 * - "trigger": trigger-initiated (user present but no client IP)
 * - "system": system/internal (no user, no key)
 */
export function getAuditLogOrigin(auth: Authenticator): string {
  if (auth.key()) {
    return "api";
  }
  if (auth.user()) {
    return auth.clientIp() ? "web" : "trigger";
  }
  return "system";
}

/**
 * Builds the audit log context with the client IP address.
 * When called with a request object, extracts the IP from headers.
 * Otherwise returns the IP from auth or "internal" as the location.
 */
export function getAuditLogContext(
  auth: Authenticator,
  req?: {
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
  }
): AuditLogContext {
  if (req) {
    return { location: getClientIp(req) };
  }
  return { location: auth.clientIp() ?? "internal" };
}
