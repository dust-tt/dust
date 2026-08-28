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
import type { GetWorkspaceResponseBody } from "@app/lib/api/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const SECURITY_PERMISSION_ERROR_MESSAGE =
  "You do not have permission to manage identity and provisioning settings.";

const PostSsoEnforcementBodySchema = z.object({
  ssoEnforced: z.boolean(),
});

// Mounted at /api/w/:wId/sso.
const app = workspaceApp();

async function checkAccess(ctx: Context) {
  const auth = ctx.get("auth");

  if (!(await auth.hasWorkspacePermission("admin", "security"))) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: SECURITY_PERMISSION_ERROR_MESSAGE,
      },
    });
  }

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

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<WorkOSConnectionSyncStatus> => {
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
    status = activeConnection.state === "active" ? "configured" : "configuring";
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
});

app.delete("/", async (ctx) => {
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

// SSO enforcement is a workspace-level flag gated behind `admin:security`. Unlike the handlers
// above, it does not require a configured WorkOS org / active connection (a workspace can toggle
// enforcement independently), so it only checks the permission rather than `checkAccess`.
/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostSsoEnforcementBodySchema),
  ensureHasWorkspacePermission(
    "admin",
    "security",
    SECURITY_PERMISSION_ERROR_MESSAGE
  ),
  async (ctx): HandlerResult<GetWorkspaceResponseBody> => {
    const auth = ctx.get("auth");

    const owner = auth.getNonNullableWorkspace();
    const { ssoEnforced } = ctx.req.valid("json");

    const workspace = await WorkspaceResource.fetchByModelId(owner.id);
    if (!workspace) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace you're trying to modify was not found.",
        },
      });
    }

    await workspace.updateWorkspaceSettings({ ssoEnforced });

    void emitAuditLogEvent({
      auth,
      action: "workspace.sso_enforcement_updated",
      targets: [buildAuditLogTarget("workspace", owner)],
      context: getAuditLogContext(auth),
      metadata: {
        enabled: String(ssoEnforced),
      },
    });

    return ctx.json({
      workspace: { ...owner, ssoEnforced: workspace.ssoEnforced },
    });
  }
);

export default app;
