import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import {
  ProgrammaticUsageConfigurationSchema,
  upsertProgrammaticUsageConfiguration,
} from "@app/lib/api/poke/plugins/workspaces/manage_programmatic_usage_configuration";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import { startOrResumeEnterprisePAYG } from "@app/lib/credits/payg";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  assertStripeSubscriptionIsValid,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { EnterpriseUpgradeFormSchema } from "@app/types/plan";

export interface UpgradeEnterpriseSuccessResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<UpgradeEnterpriseSuccessResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Could not find the workspace.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const plugin = pluginManager.getNonNullablePlugin(
        "upgrade-enterprise-plan"
      );
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

      const bodyValidation = EnterpriseUpgradeFormSchema.decode(req.body);
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

      const stripeSubscription = await getStripeSubscription(
        body.stripeSubscriptionId
      );
      if (!stripeSubscription) {
        const errorMessage = "The Stripe subscription does not exist.";
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }

      // Ensure that the stripe subscription is either attached to the current workspace
      // or is not attached to any workspace.
      const subscription = await SubscriptionResource.fetchByStripeId(
        stripeSubscription.id
      );
      const currentWorkspaceSubscription = auth.subscription();
      const isCurrentWorkspaceSubscription =
        currentWorkspaceSubscription &&
        currentWorkspaceSubscription.stripeSubscriptionId ===
          stripeSubscription.id;

      if (subscription && !isCurrentWorkspaceSubscription) {
        const errorMessage =
          "The subscription is already attached to another workspace.";
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }

      if (!isEnterpriseSubscription(stripeSubscription)) {
        const errorMessage =
          "The subscription provided is not an enterprise subscription.";
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }

      const assertValidSubscription =
        assertStripeSubscriptionIsValid(stripeSubscription);
      if (assertValidSubscription.isErr()) {
        const errorMessage = assertValidSubscription.error.invalidity_message;
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }

      const programmaticConfigValidation =
        ProgrammaticUsageConfigurationSchema.safeParse(body);
      if (!programmaticConfigValidation.success) {
        const errorMessage = programmaticConfigValidation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }

      const {
        freeCreditsOverrideEnabled,
        freeCreditsDollars,
        defaultDiscountPercent,
        paygEnabled,
        paygCapDollars,
      } = programmaticConfigValidation.data;

      const freeCreditMicroUsd =
        freeCreditsOverrideEnabled && freeCreditsDollars
          ? Math.round(freeCreditsDollars * 1_000_000)
          : null;

      const paygCapMicroUsd =
        paygEnabled && paygCapDollars
          ? Math.round(paygCapDollars * 1_000_000)
          : null;

      const upsertResult = await upsertProgrammaticUsageConfiguration(auth, {
        freeCreditMicroUsd,
        defaultDiscountPercent: defaultDiscountPercent ?? 0,
        paygCapMicroUsd,
      });
      if (upsertResult.isErr()) {
        const errorMessage = upsertResult.error.message;
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }

      try {
        await SubscriptionResource.pokeUpgradeWorkspaceToEnterprise(auth, body);
        // Restore workspace functionality after subscription upgrade
        await restoreWorkspaceAfterSubscription(auth);

        // If PAYG is enabled, create the PAYG credit for the current billing period
        if (paygEnabled && paygCapMicroUsd !== null) {
          const paygResult = await startOrResumeEnterprisePAYG({
            auth,
            stripeSubscription,
            paygCapMicroUsd,
          });
          if (paygResult.isErr()) {
            const errorMessage = paygResult.error.message;
            await pluginRun.recordError(
              `Workspace upgraded but PAYG credit creation failed: ${errorMessage}`
            );
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: `Workspace upgraded but PAYG credit creation failed: ${errorMessage}`,
              },
            });
          }
        }
      } catch (error) {
        const errorString =
          error instanceof Error
            ? error.message
            : JSON.stringify(error, null, 2);
        await pluginRun.recordError(errorString);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorString,
          },
        });
      }

      const paygStatus = paygEnabled
        ? `PAYG enabled with $${paygCapDollars} cap.`
        : "PAYG disabled.";
      await pluginRun.recordResult({
        display: "text",
        value: `Workspace ${owner.name} upgraded to enterprise. ${paygStatus}`,
      });

      res.status(200).json({
        success: true,
      });
      break;

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
