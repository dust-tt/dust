/**
 * Clears the `paymentFailingSince` flag on the active subscription of a given
 * workspace (i.e. calls `clearPaymentFailingStatus`).
 *
 * Usage (from prodbox, inside the front/ directory):
 *   npx tsx scripts/clear_payment_failing_status.ts --workspaceId <wId> [--execute]
 *
 * Without --execute the script runs in dry-run mode: it resolves the active
 * subscription and reports its current payment-failing status but does NOT
 * clear it.
 */

import { Authenticator } from "@app/lib/auth";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      describe: "The sId of the workspace whose active subscription to clear",
      demandOption: true,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();

    const subscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);

    if (!subscription) {
      logger.error({ workspaceId }, "No active subscription for workspace.");
      process.exit(1);
    }

    logger.info(
      {
        workspaceId,
        subscriptionId: subscription.sId,
        paymentFailingSince: subscription.paymentFailingSince,
      },
      "Found active subscription."
    );

    if (subscription.paymentFailingSince === null) {
      logger.info(
        { workspaceId },
        "Subscription is not in a payment-failing state, nothing to do."
      );
      return;
    }

    if (!execute) {
      logger.info(
        { workspaceId },
        "Dry run: would clear payment-failing status (re-run with --execute)."
      );
      return;
    }

    await subscription.clearPaymentFailingStatus();

    logger.info({ workspaceId }, "Cleared payment-failing status.");
  }
);
