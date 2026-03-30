/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import type { Authenticator } from "@app/lib/auth";
import { provisionMetronomeCustomerAndContract } from "@app/lib/metronome/client";
import { addAllMembersAsProSeats } from "@app/lib/metronome/seats";
import { PlanModel } from "@app/lib/models/plan";
import { PRO_PLAN_METRONOME_CODE } from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { getStripeClient } from "@app/lib/plans/stripe";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

const FinalizeMetronomeBody = t.type({
  sessionId: t.string,
});

export type FinalizeMetronomeResponseBody = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FinalizeMetronomeResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST is supported.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can manage the workspace subscription.",
      },
    });
  }

  const bodyValidation = FinalizeMetronomeBody.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { sessionId } = bodyValidation.right;
  const owner = auth.getNonNullableWorkspace();

  // Retrieve the Stripe checkout session to get the Stripe customer ID.
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : null;

  if (!stripeCustomerId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No Stripe customer found in checkout session.",
      },
    });
  }

  // Create the Metronome subscription record in the DB (idempotent: skip if
  // already on the Metronome plan, e.g. on a finalize retry).
  const currentSubscription = auth.subscription();
  if (currentSubscription?.plan.code !== PRO_PLAN_METRONOME_CODE) {
    await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
      workspaceId: owner.sId,
      planCode: PRO_PLAN_METRONOME_CODE,
      endDate: null,
    });
  }

  await restoreWorkspaceAfterSubscription(auth);

  // Provision Metronome customer and contract.
  const metronomePlan = await PlanModel.findOne({
    where: { code: PRO_PLAN_METRONOME_CODE },
  });
  if (metronomePlan) {
    const renderedPlan = renderPlanFromModel({ plan: metronomePlan });
    if (renderedPlan.metronomePackageAlias) {
      const result = await provisionMetronomeCustomerAndContract({
        workspaceSId: owner.sId,
        workspaceName: owner.name,
        stripeCustomerId,
        packageAlias: renderedPlan.metronomePackageAlias,
      });

      if (result.isOk()) {
        const { metronomeCustomerId } = result.value;
        await WorkspaceResource.updateMetronomeCustomerId(
          owner.sId,
          metronomeCustomerId
        );

        // Seed all existing members as Pro seats on the new contract.
        const workspaceResource = await WorkspaceResource.fetchById(owner.sId);
        if (workspaceResource) {
          const members = await MembershipResource.getActiveMemberships({
            workspace: owner,
          });
          const memberSIds = members.memberships
            .map((m) => m.user?.sId)
            .filter((s): s is string => !!s);
          void addAllMembersAsProSeats(workspaceResource, memberSIds).catch(
            (err) => {
              logger.error(
                { workspaceId: owner.sId, err },
                "[Metronome] Failed to seed members as pro seats after checkout"
              );
            }
          );
        }
      } else {
        logger.error(
          { workspaceId: owner.sId, error: result.error.message },
          "[Metronome] Failed to provision after checkout"
        );
      }
    }
  }

  return res.status(200).json({ success: true });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
