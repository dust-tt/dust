/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { provisionMetronomeCustomerAndContract } from "@app/lib/metronome/client";
import { PlanModel } from "@app/lib/models/plan";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { getCustomerId, getStripeSubscription } from "@app/lib/plans/stripe";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { FreePlanUpgradeFormSchema } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type UpgradeWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<UpgradeWorkspaceResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const plugin = pluginManager.getNonNullablePlugin("upgrade-free-plan");
      const pluginRun = await PluginRunResource.makeNew(
        plugin,
        req.body,
        auth.getNonNullableUser(),
        owner,
        {
          resourceId: owner.sId,
          resourceType: "workspaces",
        }
      );

      const bodyValidation = FreePlanUpgradeFormSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        const errorMessage = `The request body is invalid: ${pathError}`;
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }
      const body = bodyValidation.right;
      const planCode = body.planCode;
      const endDate = body.endDate;

      if (endDate && new Date(endDate) < new Date()) {
        const errorMessage = "The end date is in the past.";
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The end date is in the past.",
          },
        });
      }

      await SubscriptionResource.pokeUpgradeWorkspaceToPlan({
        auth,
        planCode,
        endDate: endDate ? new Date(endDate) : null,
      });

      // Restore workspace functionality after subscription upgrade
      await restoreWorkspaceAfterSubscription(auth);

      // If the new plan is Metronome-billed, ensure customer + contract exist.
      const newPlan = await PlanModel.findOne({ where: { code: planCode } });
      if (newPlan) {
        const renderedPlan = renderPlanFromModel({ plan: newPlan });
        if (renderedPlan.metronomePackageAlias) {
          // Try to get Stripe customer ID from existing subscription for linking.
          const subscription = auth.subscriptionResource();
          let stripeCustomerId: string | null = null;
          if (subscription?.stripeSubscriptionId) {
            const stripeSubscription = await getStripeSubscription(
              subscription.stripeSubscriptionId
            );
            if (stripeSubscription) {
              stripeCustomerId = getCustomerId(stripeSubscription);
            }
          }

          const result = await provisionMetronomeCustomerAndContract({
            workspaceSId: owner.sId,
            workspaceName: owner.name,
            stripeCustomerId,
            packageAlias: renderedPlan.metronomePackageAlias,
          });

          if (result.isOk()) {
            await WorkspaceResource.updateMetronomeCustomerId(
              owner.sId,
              result.value.metronomeCustomerId
            );
          } else {
            logger.error(
              {
                workspaceId: owner.sId,
                error: result.error.message,
              },
              "[Metronome] Failed to provision during Poke upgrade"
            );
          }
        }
      }

      await pluginRun.recordResult({
        display: "text",
        value: `Workspace ${owner.name} upgraded to plan ${planCode}.`,
      });

      return res.status(200).json({
        workspace: renderLightWorkspaceType({
          workspace: owner,
          role: "admin",
        }),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
