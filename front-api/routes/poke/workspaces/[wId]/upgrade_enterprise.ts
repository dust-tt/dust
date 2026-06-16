import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import {
  ProgrammaticUsageConfigurationSchema,
  upsertProgrammaticUsageConfiguration,
} from "@app/lib/api/poke/plugins/workspaces/manage_programmatic_usage_configuration";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { startOrResumeEnterprisePAYG } from "@app/lib/credits/payg";
import {
  assertStripeSubscriptionIsValid,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { EnterpriseUpgradeFormSchema } from "@app/types/plan";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { fromError } from "zod-validation-error";

export interface PokeUpgradeEnterpriseSuccessResponseBody {
  success: boolean;
}

// Mounted at /api/poke/workspaces/:wId/upgrade_enterprise.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  async (ctx): HandlerResult<PokeUpgradeEnterpriseSuccessResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const body = await ctx.req.json().catch(() => ({}));

    const plugin = pluginManager.getNonNullablePlugin(
      "upgrade-enterprise-plan"
    );
    const pluginRun = await PluginRunResource.makeNew(
      plugin,
      body,
      auth.getNonNullableUser(),
      owner,
      { resourceId: owner.sId, resourceType: "workspaces" }
    );

    const bodyValidation = EnterpriseUpgradeFormSchema.safeParse(body);
    if (!bodyValidation.success) {
      const errorMessage = `The request body is invalid: ${fromError(bodyValidation.error).toString()}`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }
    const validated = bodyValidation.data;

    const programmaticConfigValidation =
      ProgrammaticUsageConfigurationSchema.safeParse(validated);
    if (!programmaticConfigValidation.success) {
      const errorMessage = programmaticConfigValidation.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
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
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }

    if (!validated.stripeSubscriptionId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "stripeSubscriptionId is required for Stripe-billed subscriptions.",
        },
      });
    }

    const stripeSubscription = await getStripeSubscription(
      validated.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      const errorMessage = "The Stripe subscription does not exist.";
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }

    const isAlreadyUsed = await SubscriptionResource.isStripeIdAlreadyUsed(
      stripeSubscription.id
    );
    if (isAlreadyUsed) {
      const errorMessage =
        "The Stripe subscription ID is already used by an existing subscription.";
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }

    if (!isEnterpriseSubscription(stripeSubscription)) {
      const errorMessage =
        "The subscription provided is not an enterprise subscription.";
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }

    const assertValidSubscription =
      assertStripeSubscriptionIsValid(stripeSubscription);
    if (assertValidSubscription.isErr()) {
      const errorMessage = assertValidSubscription.error.invalidity_message;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }

    try {
      await SubscriptionResource.pokeUpgradeWorkspaceToEnterprise(
        auth,
        validated,
        stripeSubscription
      );
      await restoreWorkspaceAfterSubscription(auth);

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
          return apiError(ctx, {
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
        error instanceof Error ? error.message : JSON.stringify(error, null, 2);
      await pluginRun.recordError(errorString);

      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorString },
      });
    }

    const paygStatus = paygEnabled
      ? `PAYG enabled with $${paygCapDollars} cap.`
      : "PAYG disabled.";
    await pluginRun.recordResult({
      display: "text",
      value: `Workspace ${owner.name} upgraded to enterprise. ${paygStatus}`,
    });

    return ctx.json({ success: true });
  }
);

export default app;
