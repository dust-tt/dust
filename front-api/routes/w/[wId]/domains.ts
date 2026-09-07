import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  generateWorkOSAdminPortalUrl,
  getOrCreateWorkOSOrganization,
} from "@app/lib/api/workos/organization";
import { removeWorkOSOrganizationDomain } from "@app/lib/api/workos/organization_primitives";
import type { GetWorkspaceResponseBody } from "@app/lib/api/workspace";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import type { GetWorkspaceDomainsResponseBody } from "@app/types/api/workos/organization";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const DeleteWorkspaceDomainRequestBodySchema = z.object({
  domain: z.string(),
});

const DomainAutoJoinBatchBodySchema = z.object({
  domainUpdates: z.array(
    z.object({
      domain: z.string(),
      domainAutoJoinEnabled: z.boolean(),
    })
  ),
});

const DomainAutoJoinSingleBodySchema = z.object({
  domain: z.string().optional(),
  domainAutoJoinEnabled: z.boolean(),
});

const PostDomainAutoJoinBodySchema = z.union([
  DomainAutoJoinBatchBodySchema,
  DomainAutoJoinSingleBodySchema,
]);

const SECURITY_PERMISSION_ERROR_MESSAGE =
  "You do not have permission to manage identity and provisioning settings.";

// Mounted at /api/w/:wId/domains.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasWorkspacePermission(
    "admin",
    "security",
    SECURITY_PERMISSION_ERROR_MESSAGE
  ),
  async (ctx): HandlerResult<GetWorkspaceDomainsResponseBody> => {
    const auth = ctx.get("auth");

    // Safety net for legacy workspaces that predate creating a WorkOS
    // organization at workspace creation time.
    const organizationRes = await getOrCreateWorkOSOrganization(
      auth.getNonNullableWorkspace()
    );

    if (organizationRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to get WorkOS organization",
        },
      });
    }

    // If there is no organization, return an empty array.
    if (!organizationRes.value) {
      return ctx.json({ domains: [] });
    }

    const { link } = await generateWorkOSAdminPortalUrl({
      organization: organizationRes.value.id,
      workOSIntent: WorkOSPortalIntent.DomainVerification,
      returnUrl: `${ctx.req.header("origin")}/w/${auth.getNonNullableWorkspace().sId}/members`,
    });

    return ctx.json({
      addDomainLink: link,
      domains: organizationRes.value.domains,
    });
  }
);

app.delete(
  "/",
  validate("json", DeleteWorkspaceDomainRequestBodySchema),
  ensureHasWorkspacePermission(
    "admin",
    "security",
    SECURITY_PERMISSION_ERROR_MESSAGE
  ),
  async (ctx) => {
    const auth = ctx.get("auth");

    const body = ctx.req.valid("json");

    const removeDomainRes = await removeWorkOSOrganizationDomain(
      auth.getNonNullableWorkspace(),
      { domain: body.domain }
    );

    if (removeDomainRes.isErr()) {
      logger.error(
        {
          error: removeDomainRes.error,
          domain: body.domain,
        },
        "Failed to remove WorkOS organization domain"
      );

      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Failed to remove WorkOS organization domain",
        },
      });
    }

    const workspace = auth.getNonNullableWorkspace();
    void emitAuditLogEvent({
      auth,
      action: "domain.removed",
      targets: [buildAuditLogTarget("workspace", workspace)],
      context: getAuditLogContext(auth),
      metadata: {
        domain: body.domain,
      },
    });

    return ctx.body(null, 204);
  }
);

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostDomainAutoJoinBodySchema),
  ensureHasWorkspacePermission(
    "admin",
    "security",
    SECURITY_PERMISSION_ERROR_MESSAGE
  ),
  async (ctx): HandlerResult<GetWorkspaceResponseBody> => {
    const auth = ctx.get("auth");

    const owner = auth.getNonNullableWorkspace();
    const body = ctx.req.valid("json");

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

    if ("domainUpdates" in body) {
      for (const update of body.domainUpdates) {
        const updateResult = await workspace.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: update.domainAutoJoinEnabled,
          domain: update.domain,
        });
        if (updateResult.isErr()) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: updateResult.error.message,
            },
          });
        }

        void emitAuditLogEvent({
          auth,
          action: "workspace.domain_auto_join_updated",
          targets: [buildAuditLogTarget("workspace", owner)],
          context: getAuditLogContext(auth),
          metadata: {
            domain: update.domain,
            enabled: String(update.domainAutoJoinEnabled),
          },
        });
      }

      return ctx.json({ workspace: owner });
    }

    const { domain, domainAutoJoinEnabled } = body;
    const updateResult = await workspace.updateDomainAutoJoinEnabled({
      domainAutoJoinEnabled,
      domain,
    });
    if (updateResult.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: updateResult.error.message,
        },
      });
    }

    void emitAuditLogEvent({
      auth,
      action: "workspace.domain_auto_join_updated",
      targets: [buildAuditLogTarget("workspace", owner)],
      context: getAuditLogContext(auth),
      metadata: {
        domain: domain ?? "*",
        enabled: String(domainAutoJoinEnabled),
      },
    });

    return ctx.json({ workspace: owner });
  }
);

export default app;
