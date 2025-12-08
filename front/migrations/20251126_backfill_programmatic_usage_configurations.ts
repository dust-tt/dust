import { getWorkspacePublicAPILimits } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import {
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { LightWorkspaceType } from "@app/types";

const BASE_TOKEN_MARKUP_PERCENT = 30;

function calculateDefaultDiscountPercent(markupPercent: number): number {
  // Formula: defaultDiscountPercent = (1 - (100 + markupPercent) / (100 + 30) * 100
  // Input markup is in percentage (e.g., 20 for 20%)
  // Base markup is 30%
  // Example: markup=20 → (1 - (100 + 20) / (100 + 30)) * 100 = (1-120/130) * 100 = 7.69%
  const discountPercent =
    (1 - (100 + markupPercent) / (100 + BASE_TOKEN_MARKUP_PERCENT)) * 100;
  return Math.round(discountPercent); // Round, PUC model uses integer percent
}

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const workspaceLogger = logger.child({ workspaceId: workspace.sId });

  // Get active subscription and check if it's enterprise.
  const subscription =
    await SubscriptionResource.fetchActiveByWorkspace(workspace);

  if (!subscription || !subscription.stripeSubscriptionId) {
    workspaceLogger.info("Skipping: no active subscription found");
    return;
  }

  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );
  if (!stripeSubscription) {
    workspaceLogger.info(
      {
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      "Skipping: stripe subscription not found"
    );
    return;
  }

  if (!isEnterpriseSubscription(stripeSubscription)) {
    return;
  }

  // Check if workspace has enabled publicApiLimits.
  const publicApiLimits = getWorkspacePublicAPILimits(workspace);

  if (!publicApiLimits || !publicApiLimits.enabled) {
    workspaceLogger.info(
      { enabled: publicApiLimits?.enabled },
      "Skipping: publicApiLimits not enabled or invalid"
    );
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Compute configuration data.
  const { markup, monthlyLimit } = publicApiLimits;
  if (markup < 0 || monthlyLimit <= 0) {
    workspaceLogger.warn(
      { markup, monthlyLimit },
      "Skipping: invalid markup or monthlyLimit values"
    );
    return;
  }

  const defaultDiscountPercent = calculateDefaultDiscountPercent(markup);
  const paygCapMicroUsd = Math.round(monthlyLimit * 1_000_000);
  const freeCreditMicroUsd = undefined; // Setting free credit to 0 micro USD as default

  if (defaultDiscountPercent < 0 || defaultDiscountPercent > 100) {
    workspaceLogger.error(
      { markup, defaultDiscountPercent },
      "Skipping: calculated discount percent out of range"
    );
    return;
  }

  // Check if configuration already exists.
  const existingConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  const isUpdate = !!existingConfig;

  workspaceLogger.info(
    {
      markup,
      monthlyLimit,
      defaultDiscountPercent,
      paygCapMicroUsd,
      existingConfigSId: existingConfig?.sId,
      execute,
    },
    execute
      ? isUpdate
        ? "Updating existing programmatic usage configuration"
        : "Creating programmatic usage configuration"
      : isUpdate
        ? "Would update existing programmatic usage configuration (dry run)"
        : "Would create programmatic usage configuration (dry run)"
  );

  if (execute) {
    const result = isUpdate
      ? await existingConfig.updateConfiguration(auth, {
          freeCreditMicroUsd,
          defaultDiscountPercent,
          paygCapMicroUsd,
        })
      : await ProgrammaticUsageConfigurationResource.makeNew(auth, {
          freeCreditMicroUsd,
          defaultDiscountPercent,
          paygCapMicroUsd,
        });

    if (result.isErr()) {
      workspaceLogger.error(
        { error: result.error },
        isUpdate
          ? "Failed to update configuration"
          : "Failed to create configuration"
      );
      return;
    }

    workspaceLogger.info(
      isUpdate
        ? "Successfully updated configuration"
        : "Successfully created configuration"
    );
  }
}

makeScript(
  {
    wId: {
      type: "string",
      demandOption: false,
      describe:
        "Workspace sId to backfill (optional, processes all if omitted)",
    },
  },
  async ({ wId, execute }, logger) => {
    logger.info(
      { execute, workspaceId: wId ?? "all" },
      "Starting programmatic usage configuration backfill"
    );

    if (wId) {
      const workspace = await WorkspaceModel.findOne({ where: { sId: wId } });

      if (!workspace) {
        throw new Error(`Workspace not found: ${wId}`);
      }

      await backfillWorkspace(
        renderLightWorkspaceType({ workspace }),
        execute,
        logger
      );
    } else {
      const workspaces = await WorkspaceModel.findAll({
        where: {
          "metadata.publicApiLimits.enabled": true,
        },
      });

      logger.info("Found %d workspaces to process", workspaces.length);

      await concurrentExecutor(
        workspaces,
        async (workspace) => {
          await backfillWorkspace(
            renderLightWorkspaceType({ workspace }),
            execute,
            logger
          );
        },
        { concurrency: 8 }
      );
    }

    logger.info("Programmatic usage configuration backfill completed");
  }
);
