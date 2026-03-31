import { createMetronomeCustomer } from "@app/lib/metronome/client";
import { SubscriptionModel } from "@app/lib/models/plan";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

async function provisionCustomer(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
) {
  // Try to get Stripe customer ID from the active subscription.
  let stripeCustomerId = "";
  const subscription = await SubscriptionModel.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });
  if (subscription?.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (
      stripeSubscription?.customer &&
      typeof stripeSubscription.customer === "string"
    ) {
      stripeCustomerId = stripeSubscription.customer;
    }
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      stripeCustomerId: stripeCustomerId || "(none)",
    },
    `${execute ? "" : "[DRYRUN] "}Provisioning Metronome customer`
  );

  if (!execute) {
    return;
  }

  const result = await createMetronomeCustomer({
    workspaceId: workspace.sId,
    workspaceName: workspace.name,
    stripeCustomerId,
  });

  if (result.isOk()) {
    logger.info(
      {
        workspaceId: workspace.sId,
        metronomeCustomerId: result.value.metronomeCustomerId,
      },
      "Metronome customer provisioned"
    );
  } else {
    logger.error(
      { workspaceId: workspace.sId, error: result.error.message },
      "Failed to provision Metronome customer"
    );
  }
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Workspace sId to provision. Omit to provision all workspaces.",
      type: "string" as const,
    },
  },
  async (args, logger) => {
    if (args.workspaceId) {
      const workspace = await WorkspaceResource.fetchById(args.workspaceId);
      if (!workspace) {
        logger.error({ workspaceId: args.workspaceId }, "Workspace not found");
        return;
      }
      await provisionCustomer(
        renderLightWorkspaceType({ workspace }),
        args.execute,
        logger
      );
    } else {
      await runOnAllWorkspaces(
        (workspace) => provisionCustomer(workspace, args.execute, logger),
        { concurrency: 4 }
      );
    }
  }
);
