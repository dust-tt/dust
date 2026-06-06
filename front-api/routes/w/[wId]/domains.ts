import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { GetWorkspaceDomainsResponseBody } from "@app/lib/api/workos/organization";
import {
  generateWorkOSAdminPortalUrl,
  getOrCreateWorkOSOrganization,
} from "@app/lib/api/workos/organization";
import { removeWorkOSOrganizationDomain } from "@app/lib/api/workos/organization_primitives";
import { WorkOSPortalIntent } from "@app/lib/types/workos";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const DeleteWorkspaceDomainRequestBodySchema = z.object({
  domain: z.string(),
});

// Mounted at /api/w/:wId/domains.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceDomainsResponseBody> => {
    const auth = ctx.get("auth");

    // If the workspace doesn't have a WorkOS organization (which can happen for workspaces
    // created via admin tools), we create one before fetching domains. This ensures the
    // endpoint works for all workspaces, regardless of how they were created.
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
  ensureIsAdmin(),
  validate("json", DeleteWorkspaceDomainRequestBodySchema),
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

export default app;
