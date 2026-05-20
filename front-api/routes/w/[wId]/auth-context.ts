import { Hono } from "hono";

import config from "@app/lib/api/config";
import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { isWorkspaceEligibleForTrial } from "@app/lib/plans/trial";
import { getClientIp } from "@app/lib/utils/request";
import type { SubscriptionType } from "@app/types/plan";
import type { ProvidersHealth } from "@app/types/provider_credential";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType, UserType } from "@app/types/user";

import { resolveSession } from "@front-api/middleware/session_resolution";
import { apiError } from "@front-api/middleware/utils";

export type GetWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  isBuilder: boolean;
  featureFlags: WhitelistableFeature[];
  isEligibleForTrial?: boolean;
  vizUrl: string;
  providersHealth: ProvidersHealth | null;
};

// Mounted at /api/w/:wId/auth-context.
//
// This route resolves auth inline instead of relying on workspaceAuth because
// it must allow the workspace to be missing locally — when missing, it returns
// a redirect to the region that owns the workspace. It also bypasses the
// canUseProduct paywall, which is enforced client-side in the SPA's
// WorkspacePage.
const app = new Hono();

app.get("/", async (c) => {
  const wId = c.req.param("wId");
  if (!wId) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const sessionResult = await resolveSession(c);
  if (sessionResult instanceof Response) {
    return sessionResult;
  }

  const auth = await Authenticator.fromSession(sessionResult, wId);

  const headers: Record<string, string | string[] | undefined> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const ip = getClientIp({ headers });
  if (ip !== "internal") {
    auth.setClientIp(ip);
  }

  const workspace = auth.workspace();
  const subscription = auth.subscription();

  // If workspace not found locally, lookup in other region.
  if (!workspace || !subscription) {
    const redirect = await getWorkspaceRegionRedirect(wId);
    if (redirect) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "workspace_in_different_region",
          message: "Workspace is located in a different region",
          redirect,
        },
      });
    }

    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: "Only users of the workspace can access this content.",
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

  const body: GetWorkspaceAuthContextResponseType = {
    user: user.toJSON(),
    workspace,
    subscription,
    isAdmin: auth.isAdmin(),
    isBuilder: auth.isBuilder(),
    featureFlags,
    ...(isEligibleForTrial !== undefined && { isEligibleForTrial }),
    vizUrl: config.getVizPublicUrl(),
    providersHealth: auth.providersHealth(),
  };

  return c.json(body);
});

export default app;
