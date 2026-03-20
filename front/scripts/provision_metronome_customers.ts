import { createMetronomeCustomer } from "@app/lib/metronome/client";
import { getCustomerId, getStripeSubscription } from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function provisionWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );

  if (!subscription) {
    logger.info(
      { workspaceId: workspace.sId },
      "[Metronome Migration] No active subscription — skipping"
    );
    return;
  }

  if (!subscription.stripeSubscriptionId) {
    logger.info(
      { workspaceId: workspace.sId },
      "[Metronome Migration] No Stripe subscription — skipping"
    );
    return;
  }

  const stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );

  if (!stripeSubscription) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
      "[Metronome Migration] Stripe subscription not found — skipping"
    );
    return;
  }

  const stripeCustomerId = getCustomerId(stripeSubscription);

  if (execute) {
    const result = await createMetronomeCustomer({
      workspaceSId: workspace.sId,
      workspaceName: workspace.name,
      stripeCustomerId,
    });

    if (result.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          stripeCustomerId,
          error: result.error.message,
        },
        "[Metronome Migration] Failed to create customer"
      );
      return;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        stripeCustomerId,
        metronomeCustomerId: result.value.id,
      },
      "[Metronome Migration] Customer created"
    );
  } else {
    logger.info(
      {
        workspaceId: workspace.sId,
        stripeCustomerId,
      },
      "[Metronome Migration] [DRY RUN] Would create Metronome customer"
    );
  }
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
      await runOnAllWorkspaces(
        async (workspace) => {
          if (workspace.sId === workspaceId) {
            await provisionWorkspace(workspace, execute, logger);
          }
        },
        { concurrency: 1 }
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await provisionWorkspace(workspace, execute, logger);
        },
        { concurrency: 4 }
      );
    }
  }
);
