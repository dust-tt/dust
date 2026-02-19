import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { getWorkspaceCreationDate } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ExtensionConfigurationType } from "@app/types/extension";
import type { SubscriptionType } from "@app/types/plan";
import type { ProgrammaticUsageConfigurationType } from "@app/types/programmatic_usage";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { WHITELISTABLE_FEATURES } from "@app/types/shared/feature_flags";
import type { WorkspaceDomain } from "@app/types/workspace";
import { format } from "date-fns/format";
import type { NextApiRequest, NextApiResponse } from "next";
import type Stripe from "stripe";

export type PokeGetWorkspaceInfo = {
  activeSubscription: SubscriptionType;
  baseUrl: string;
  extensionConfig: ExtensionConfigurationType | null;
  programmaticUsageConfig: ProgrammaticUsageConfigurationType | null;
  stripeSubscription: Stripe.Subscription | null;
  subscriptions: SubscriptionType[];
  whitelistableFeatures: WhitelistableFeature[];
  workspaceCreationDay: string;
  workspaceVerifiedDomains: WorkspaceDomain[];
  workosEnvironmentId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetWorkspaceInfo>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();
  const activeSubscription = auth.subscription();

  if (!owner || !activeSubscription || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const subscriptionResources =
        await SubscriptionResource.fetchByAuthenticator(auth);
      const subscriptions = subscriptionResources.map((s) => s.toJSON());

      const workspaceResource = await WorkspaceResource.fetchById(owner.sId);
      if (!workspaceResource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Workspace not found.",
          },
        });
      }
      const workspaceVerifiedDomains =
        await workspaceResource.getVerifiedDomains();

      const workspaceCreationDay = await getWorkspaceCreationDate(owner.sId);

      const extensionConfig =
        await ExtensionConfigurationResource.fetchForWorkspace(auth);

      const programmaticUsageConfig =
        await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

      let stripeSubscription: Stripe.Subscription | null = null;
      if (activeSubscription.stripeSubscriptionId) {
        stripeSubscription = await getStripeSubscription(
          activeSubscription.stripeSubscriptionId
        );
      }

      return res.status(200).json({
        activeSubscription,
        stripeSubscription,
        subscriptions,
        whitelistableFeatures: WHITELISTABLE_FEATURES,
        workspaceVerifiedDomains,
        workspaceCreationDay: format(workspaceCreationDay, "yyyy-MM-dd"),
        extensionConfig: extensionConfig?.toJSON() ?? null,
        programmaticUsageConfig: programmaticUsageConfig?.toJSON() ?? null,
        baseUrl: config.getClientFacingUrl(),
        workosEnvironmentId: config.getWorkOSEnvironmentId(),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
