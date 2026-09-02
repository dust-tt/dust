import { getPodRestrictionImpact } from "@app/lib/api/projects/restriction_impact";
import type { GetPodRestrictionImpactResponseBody } from "@app/types/api/projects/restriction_impact";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/project_restriction_impact.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetPodRestrictionImpactResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Restriction impact is only available for project spaces.",
        },
      });
    }

    // Only editors can flip the visibility toggle this warning belongs to, and the counts
    // aggregate other members' usage.
    if (!auth.can("admin", space)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only project editors can read the restriction impact.",
        },
      });
    }

    const restrictionImpact = await getPodRestrictionImpact(auth, space);

    return ctx.json({ restrictionImpact });
  }
);

export default app;
