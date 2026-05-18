import { ensureMetronomeCustomerForWorkspace } from "@app/lib/metronome/contracts";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { FREE_TRIAL_PHONE_PLAN_CODE } from "@app/lib/plans/plan_codes";
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
  if (workspace.metronomeCustomerId) {
    return;
  }

  // Only provision workspaces with an active subscription. Workspaces on
  // FREE_NO_PLAN (no subscription row) are skipped — going forward they
  // receive a Metronome customer when they subscribe (via
  // `internalSubscribeWorkspaceToFreePlan` or the paid path).
  // FREE_TRIAL_PHONE_PLAN workspaces are also skipped — phone trials have
  // hard-coded usage limits and never interact with Metronome.
  const subscription = await SubscriptionModel.findOne({
    where: { workspaceId: workspace.id, status: "active" },
    include: [PlanModel],
  });
  if (!subscription) {
    return;
  }
  if (subscription.plan?.code === FREE_TRIAL_PHONE_PLAN_CODE) {
    return;
  }

  // Optionally link to a Stripe customer if the active subscription is paid.
  // Free-plan subscriptions get a Metronome customer with no Stripe link.
  let stripeCustomerId: string | undefined;
  if (subscription.stripeSubscriptionId) {
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
      stripeCustomerId: stripeCustomerId ?? null,
    },
    `${execute ? "" : "[DRYRUN] "}Provisioning Metronome customer`
  );

  if (!execute) {
    return;
  }

  const result = await ensureMetronomeCustomerForWorkspace({
    workspace,
    stripeCustomerId,
  });

  if (result.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: result.error.message },
      "Failed to provision Metronome customer"
    );
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      metronomeCustomerId: result.value.metronomeCustomerId,
    },
    "Metronome customer provisioned and workspace updated"
  );
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
