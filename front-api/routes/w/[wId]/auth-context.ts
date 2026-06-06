import type { GetWorkspaceAuthContextResponseType } from "@app/lib/api/auth_context";
import config from "@app/lib/api/config";
import {
  getForcedApiUrlRedirect,
  getWorkspaceRegionRedirect,
} from "@app/lib/api/regions/lookup";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { isWorkspaceEligibleForTrial } from "@app/lib/plans/trial";
import { sessionApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  wId: z.string(),
});

// Mounted at /api/w/:wId/auth-context.
//
// Unlike most workspace-scoped routes, this one runs even when the workspace
// can't be resolved locally: it falls back to a cross-region lookup so the
// SPA can redirect to the correct region. We therefore use `sessionAuth`
// (not `workspaceAuth`) and resolve the `Authenticator` inline.
const app = sessionApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetWorkspaceAuthContextResponseType> => {
    const session = ctx.get("session");
    const { wId } = ctx.req.valid("param");

    const auth = await Authenticator.fromSession(session, wId);

    const workspace = auth.workspace();
    const subscription = auth.subscription();

    // If workspace not found locally, lookup in other region.
    if (!workspace || !subscription) {
      const redirect = await getWorkspaceRegionRedirect(wId);

      if (redirect) {
        return ctx.json(
          {
            error: {
              type: "workspace_in_different_region",
              message: "Workspace is located in a different region",
              redirect,
            },
          },
          400
        );
      }

      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "Workspace not found.",
        },
      });
    }

    const user = auth.getNonNullableUser();

    // Only check trial eligibility when canUseProduct is false (paywall case)
    // to avoid the extra DB query on every auth-context call.
    const isEligibleForTrial = !subscription.plan.limits.canUseProduct
      ? await isWorkspaceEligibleForTrial(auth)
      : false;

    const featureFlags = await getFeatureFlags(auth);

    // When the workspace is flagged, force the SPA onto the regional API
    // subdomain as its backend by reusing the region-redirect mechanism.
    const forcedApiUrlRedirect = getForcedApiUrlRedirect({
      enabled: featureFlags.includes("force_us_api_url"),
      requestHost: ctx.req.header("host"),
    });
    if (forcedApiUrlRedirect) {
      return ctx.json(
        {
          error: {
            type: "workspace_in_different_region",
            message: "Workspace is located in a different region",
            redirect: forcedApiUrlRedirect,
          },
        },
        400
      );
    }

    return ctx.json({
      user: user.toJSON(),
      workspace,
      subscription,
      isAdmin: auth.isAdmin(),
      isBuilder: auth.isBuilder(),
      featureFlags,
      ...(isEligibleForTrial !== undefined && { isEligibleForTrial }),
      vizUrl: config.getVizPublicUrl(),
      providersHealth: auth.providersHealth(),
    });
  }
);

export default app;
