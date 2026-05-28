import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  deleteWorkOSOrganizationSSOConnection,
  generateWorkOSAdminPortalUrl,
  getWorkOSOrganizationSSOConnections,
} from "@app/lib/api/workos/organization";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import type { Context } from "hono";

// Mounted at /api/w/:wId/sso.
const app = workspaceApp();

async function checkAccess(ctx: Context) {
  const auth = ctx.get("auth");
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.workOSOrganizationId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "workos_organization_not_found",
        message: "WorkOS organization not found for this workspace.",
      },
    });
  }

  const plan = auth.getNonNullablePlan();
  if (!plan.limits.users.isSSOAllowed) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Your workspace is not authorized to perfom this action.",
      },
    });
  }

  const r = await getWorkOSOrganizationSSOConnections({ workspace });
  if (r.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "workos_server_error",
        message: `Failed to list SSO connections: ${normalizeError(r.error).message}`,
      },
    });
  }

  const ssoConnections = r.value;
  if (ssoConnections.length > 1) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "workos_multiple_sso_connections_not_supported",
        message: "Multiple SSO connections are not supported.",
      },
    });
  }

  return { auth, workspace, activeConnection: ssoConnections[0] };
}

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<WorkOSConnectionSyncStatus> => {
    const result = await checkAccess(ctx);
    if (result instanceof Response) {
      return result;
    }
    const { auth, workspace, activeConnection } = result;

    // TODO(audit): sso.connection_created — SSO connections are created via WorkOS admin portal.
    // Implement once WorkOS connection.activated webhook is subscribed.

    let status: "not_configured" | "configured" | "configuring" =
      "not_configured";
    if (activeConnection) {
      status =
        activeConnection.state === "active" ? "configured" : "configuring";
    }

    const { link } = await generateWorkOSAdminPortalUrl({
      organization: workspace.workOSOrganizationId!,
      workOSIntent: WorkOSPortalIntent.SSO,
      returnUrl: `${ctx.req.header("origin")}/w/${auth.getNonNullableWorkspace().sId}/members`,
    });

    return ctx.json({
      connection: activeConnection
        ? {
            id: activeConnection.id,
            state: activeConnection.state,
            type: activeConnection.type,
          }
        : null,
      setupLink: link,
      status,
    });
  }
);

app.delete("/", ensureIsAdmin(), async (ctx) => {
  const result = await checkAccess(ctx);
  if (result instanceof Response) {
    return result;
  }
  const { auth, workspace, activeConnection } = result;

  const r = await deleteWorkOSOrganizationSSOConnection(activeConnection);

  if (r.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "workos_server_error",
        message: `Failed to delete SSO connection: ${normalizeError(r.error).message}`,
      },
    });
  }

  void emitAuditLogEvent({
    auth,
    action: "sso.connection_deleted",
    targets: [buildAuditLogTarget("workspace", workspace)],
    context: getAuditLogContext(auth),
    metadata: {
      connection_type: activeConnection.type,
    },
  });

  return ctx.body(null, 204);
});

export default app;
