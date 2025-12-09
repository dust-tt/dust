import type Stripe from "stripe";

import { Authenticator } from "@app/lib/auth";
import { grantFreeCreditsFromSubscriptionStateChange } from "@app/lib/credits/free";
import { startOrResumeEnterprisePAYG } from "@app/lib/credits/payg";
import {
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function reconcilePAYGConfig(
  auth: Authenticator,
  workspaceSId: string,
  stripeSubscription: Stripe.Subscription | null,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const config =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

  if (!config || config.paygCapMicroUsd === null) {
    return;
  }

  const isEnterprise =
    stripeSubscription && isEnterpriseSubscription(stripeSubscription);

  if (!isEnterprise) {
    logger.info(
      {
        workspaceId: workspaceSId,
        paygCapMicroUsd: config.paygCapMicroUsd,
        hasStripeSubscription: !!stripeSubscription,
        execute,
      },
      execute
        ? "[Backfill credits] Removing paygCapCents from non-Enterprise workspace"
        : "[Backfill credits] [DRY RUN] Would remove paygCapCents from non-Enterprise workspace"
    );

    if (execute) {
      await config.updateConfiguration(auth, { paygCapMicroUsd: null });
    }
    return;
  }

  logger.info(
    {
      workspaceId: workspaceSId,
      paygCapMicroUsd: config.paygCapMicroUsd,
      execute,
    },
    execute
      ? "[Backfill credits] Ensuring PAYG credit exists for Enterprise workspace"
      : "[Backfill credits] [DRY RUN] Would ensure PAYG credit exists for Enterprise workspace"
  );

  if (execute) {
    const result = await startOrResumeEnterprisePAYG({
      auth,
      stripeSubscription,
      paygCapMicroUsd: config.paygCapMicroUsd,
    });

    if (result.isErr()) {
      logger.error(
        {
          workspaceId: workspaceSId,
          error: result.error.message,
        },
        "[Backfill credits] Failed to ensure PAYG credit"
      );
    }
  }
}

async function backfillFreeCredits(
  auth: Authenticator,
  workspaceSId: string,
  stripeSubscription: Stripe.Subscription | null,
  execute: boolean,
  logger: Logger
): Promise<void> {
  if (!stripeSubscription) {
    return;
  }

  logger.info(
    {
      workspaceId: workspaceSId,
      execute,
    },
    execute
      ? "[Backfill credits] Granting free credits"
      : "[Backfill credits] [DRY RUN] Would grant free credits"
  );

  if (execute) {
    const result = await grantFreeCreditsFromSubscriptionStateChange({
      auth,
      stripeSubscription,
    });

    if (result.isErr()) {
      logger.error(
        {
          workspaceId: workspaceSId,
          error: result.error.message,
        },
        "[Backfill credits] Free credits grant result"
      );
    }
  }
}

async function reconcileWorkspaceCredits(
  workspaceSId: string,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceSId);

  const workspace = auth.getNonNullableWorkspace();
  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const subscription =
    await SubscriptionResource.fetchActiveByWorkspace(lightWorkspace);

  const stripeSubscription = subscription?.stripeSubscriptionId
    ? await getStripeSubscription(subscription.stripeSubscriptionId)
    : null;

  await reconcilePAYGConfig(
    auth,
    workspaceSId,
    stripeSubscription,
    execute,
    logger
  );
  await backfillFreeCredits(
    auth,
    workspaceSId,
    stripeSubscription,
    execute,
    logger
  );
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    if (workspaceId) {
      await reconcileWorkspaceCredits(workspaceId, execute, logger);
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await reconcileWorkspaceCredits(workspace.sId, execute, logger);
        },
        { concurrency: 8 }
      );
    }
  }
);
