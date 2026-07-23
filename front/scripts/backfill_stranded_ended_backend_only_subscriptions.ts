/**
 * Backfill subscriptions stranded in `ended_backend_only`.
 *
 * During a Stripe → Metronome contract swap (e.g. the legacy Pro → Business
 * migration via `migrate_legacy_pro_monthly_to_business.ts`) the old
 * Stripe-backed subscription used to be marked `ended_backend_only`, relying on
 * Stripe's `customer.subscription.deleted` webhook to flip it to `ended`. But
 * that webhook and the Metronome `contract.start` fire at the same cutover
 * instant; when the Stripe event is processed first it is consumed by the
 * "active + pending → skip" branch of the webhook handler and never converges
 * the sub — leaving no later webhook to finalize it. The sub is then stranded
 * in `ended_backend_only` forever.
 *
 * The code fix (subscription_resource.ts `activatePending`) finalizes directly
 * to `ended`, so new swaps no longer strand. This script reconciles the
 * already-stranded rows: for each `ended_backend_only` subscription whose Stripe
 * subscription is confirmed `canceled` in Stripe, flip it to `ended`.
 *
 * A subscription without a `stripeSubscriptionId`, or whose Stripe subscription
 * cannot be retrieved or is not `canceled`, is left untouched and logged for
 * manual review (we only converge what Stripe confirms is actually gone).
 *
 * Dry run by default. Run with:
 *   npx tsx scripts/backfill_stranded_ended_backend_only_subscriptions.ts \
 *     [--workspaceId <sId>] [--concurrency 4] [--execute]
 */

import { getStripeSubscription } from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: {
      type: "string" as const,
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
    concurrency: {
      type: "number" as const,
      description: "Number of subscriptions to reconcile in parallel",
      default: 4,
    },
  },
  async ({ workspaceId, concurrency, execute }, logger) => {
    const stranded = await SubscriptionResource.internalListEndedBackendOnly();

    // Resolve workspace sIds for logging (batched — no per-sub DB call).
    const workspaceModelIds = [...new Set(stranded.map((s) => s.workspaceId))];
    const workspaces =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);
    const workspaceIdByModelId = new Map(workspaces.map((w) => [w.id, w.sId]));

    let subscriptions = stranded;
    if (workspaceId) {
      subscriptions = subscriptions.filter(
        (s) => workspaceIdByModelId.get(s.workspaceId) === workspaceId
      );
    }

    logger.info(
      { candidates: subscriptions.length },
      `[backfill-ended-backend-only] ${execute ? "Executing" : "[DRY RUN]"} over ${subscriptions.length} stranded subscription(s)`
    );

    let converged = 0;
    let skipped = 0;

    await concurrentExecutor(
      subscriptions,
      async (subscription) => {
        const wId = workspaceIdByModelId.get(subscription.workspaceId) ?? null;

        if (!subscription.stripeSubscriptionId) {
          skipped++;
          logger.warn(
            { workspaceId: wId, subscriptionId: subscription.sId },
            "[backfill-ended-backend-only] Skipping: no Stripe subscription to confirm cancellation against (needs manual review)"
          );
          return;
        }

        let stripeSubscription;
        try {
          stripeSubscription = await getStripeSubscription(
            subscription.stripeSubscriptionId
          );
        } catch (err) {
          skipped++;
          logger.error(
            {
              workspaceId: wId,
              subscriptionId: subscription.sId,
              stripeSubscriptionId: subscription.stripeSubscriptionId,
              error: normalizeError(err).message,
            },
            "[backfill-ended-backend-only] Skipping: failed to retrieve Stripe subscription"
          );
          return;
        }

        if (!stripeSubscription || stripeSubscription.status !== "canceled") {
          skipped++;
          logger.warn(
            {
              workspaceId: wId,
              subscriptionId: subscription.sId,
              stripeSubscriptionId: subscription.stripeSubscriptionId,
              stripeStatus: stripeSubscription?.status ?? "not_found",
            },
            "[backfill-ended-backend-only] Skipping: Stripe subscription is not canceled (needs manual review)"
          );
          return;
        }

        if (!execute) {
          logger.info(
            {
              workspaceId: wId,
              subscriptionId: subscription.sId,
              stripeSubscriptionId: subscription.stripeSubscriptionId,
            },
            "[backfill-ended-backend-only] [DRY RUN] Would converge to ended"
          );
          converged++;
          return;
        }

        await subscription.markAsEnded("ended");
        converged++;
        logger.info(
          {
            workspaceId: wId,
            subscriptionId: subscription.sId,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
          },
          "[backfill-ended-backend-only] Converged to ended"
        );
      },
      { concurrency }
    );

    logger.info(
      {
        total: subscriptions.length,
        converged,
        skipped,
      },
      `[backfill-ended-backend-only] ${execute ? "Done" : "[DRY RUN] Done"}: ${converged} ${execute ? "converged" : "would converge"}, ${skipped} skipped`
    );
  }
);
