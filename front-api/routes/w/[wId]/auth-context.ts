import { getWorkspaceCellRedirect } from "@app/lib/api/cells/lookup";
import config from "@app/lib/api/config";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { isWorkspaceEligibleForTrial } from "@app/lib/plans/trial";
import type { GetWorkspaceAuthContextResponseType } from "@app/types/api/auth_context";
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

/** @ignoreswagger */
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
      const redirect = await getWorkspaceCellRedirect(wId);

      if (redirect) {
        return ctx.json(
          {
            error: {
              type: "workspace_in_different_cell",
              message: "Workspace is located in a different cell",
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

    const workspacePermissions = await auth.getWorkspacePermissions();

    return ctx.json({
      user: user.toJSON(),
      workspace,
      subscription,
      isAdmin: auth.isAdmin(),
      isManager: auth.isManager(),
      featureFlags,
      ...(isEligibleForTrial !== undefined && { isEligibleForTrial }),
      vizUrl: config.getVizPublicUrl(),
      providersHealth: auth.providersHealth(),
      workspacePermissions,
    });
  }
);

export default app;
