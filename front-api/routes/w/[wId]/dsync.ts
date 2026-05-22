import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  deleteWorkOSOrganizationDSyncConnection,
  generateWorkOSAdminPortalUrl,
  getWorkOSOrganizationDSyncDirectories,
} from "@app/lib/api/workos/organization";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import type { Context } from "hono";

// Mounted at /api/w/:wId/dsync.
const app = workspaceApp();

async function checkAccess(ctx: Context) {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You are not authorized to perform this action.",
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
  if (!plan.limits.users.isSCIMAllowed) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Your workspace is not authorized to perform this action.",
      },
    });
  }

  const r = await getWorkOSOrganizationDSyncDirectories({ workspace });
  if (r.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "workos_server_error",
        message: `Failed to list directories: ${normalizeError(r.error).message}`,
      },
    });
  }
  const directories = r.value;

  if (directories.length > 1) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "workos_multiple_directories_not_supported",
        message: "Multiple directories are not supported.",
      },
    });
  }

  return { auth, workspace, activeDirectory: directories[0] };
}

app.get("/", async (ctx): HandlerResult<WorkOSConnectionSyncStatus> => {
  const result = await checkAccess(ctx);
  if (result instanceof Response) {
    return result;
  }
  const { auth, workspace, activeDirectory } = result;

  let status: "not_configured" | "configured" | "configuring" =
    "not_configured";
  if (activeDirectory) {
    status = activeDirectory.state === "active" ? "configured" : "configuring";
  }

  const { link } = await generateWorkOSAdminPortalUrl({
    organization: workspace.workOSOrganizationId!,
    workOSIntent: WorkOSPortalIntent.DSync,
    returnUrl: `${ctx.req.header("origin")}/w/${auth.getNonNullableWorkspace().sId}/members`,
  });

  return ctx.json({
    status,
    connection: activeDirectory
      ? {
          id: activeDirectory.id,
          state: activeDirectory.state,
          type: activeDirectory.type,
        }
      : null,
    setupLink: link,
  });
});

app.delete("/", async (ctx) => {
  const result = await checkAccess(ctx);
  if (result instanceof Response) {
    return result;
  }
  const { auth, workspace, activeDirectory } = result;

  const r = await deleteWorkOSOrganizationDSyncConnection(activeDirectory);

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
    action: "dsync.connection_deleted",
    targets: [buildAuditLogTarget("workspace", workspace)],
    context: getAuditLogContext(auth),
    metadata: {
      directory_type: activeDirectory.type,
    },
  });

  return ctx.body(null, 204);
});

export default app;
