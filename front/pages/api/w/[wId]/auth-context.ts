// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import type { GetWorkspaceAuthContextResponseType } from "@app/lib/api/auth_context";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import {
  getForcedApiUrlRedirect,
  getWorkspaceRegionRedirect,
} from "@app/lib/api/regions/lookup";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isWorkspaceEligibleForTrial } from "@app/lib/plans/trial";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceAuthContextResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const workspace = auth.workspace();
  const subscription = auth.subscription();
  const { wId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace ID.",
      },
    });
  }

  // If workspace not found locally, lookup in other region.
  if (!workspace || !subscription) {
    const redirect = await getWorkspaceRegionRedirect(wId);

    if (redirect) {
      return res.status(400).json({
        error: {
          type: "workspace_in_different_region",
          message: "Workspace is located in a different region",
          redirect,
        },
      });
    }

    return apiError(req, res, {
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

  // When the workspace is flagged, force the SPA onto the regional API subdomain
  // as its backend by reusing the region-redirect mechanism.
  const forcedApiUrlRedirect = getForcedApiUrlRedirect({
    enabled: featureFlags.includes("force_us_api_url"),
    requestHost: req.headers.host,
  });
  if (forcedApiUrlRedirect) {
    return res.status(400).json({
      error: {
        type: "workspace_in_different_region",
        message: "Workspace is located in a different region",
        redirect: forcedApiUrlRedirect,
      },
    });
  }

  return res.status(200).json({
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

export default withSessionAuthenticationForWorkspace(handler, {
  // Allow the handler to be called even if the workspace is not found.
  // Handler will check if the workspace is found in other regions.
  allowMissingWorkspace: true,
  // Allow access even when canUseProduct is false.
  // Paywall enforcement is handled client-side in the SPA's WorkspacePage.
  doesNotRequireCanUseProduct: true,
});
