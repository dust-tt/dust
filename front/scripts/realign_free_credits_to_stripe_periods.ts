import { Authenticator } from "@app/lib/auth";
import {
  calculateFreeCreditAmountMicroUsd,
  countEligibleUsersForFreeCredits,
  YEARLY_MULTIPLIER,
} from "@app/lib/credits/free";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";
import type Stripe from "stripe";

type StartedFreeCredit = CreditResource & {
  startDate: Date;
  expirationDate: Date;
};

type RealignmentAction =
  | {
      type: "create_current_period_credit";
      startDate: Date;
      expirationDate: Date;
      amountMicroUsd: number;
    }
  | { type: "update_expiration_date"; creditId: number; expirationDate: Date };

type ResultRow = {
  stripeSubscriptionId: string;
  workspaceId: string;
  workspaceName: string;
  actions: string;
};

const argumentSpecs: ArgumentSpecs = {
  planCode: {
    type: "string",
    description:
      "Optional plan code — when set, only active subscriptions on this plan are realigned",
  },
  workspaceId: {
    type: "string",
    description:
      "Optional workspace sId — when set, only this workspace's active subscription is realigned",
  },
  mode: {
    type: "string",
    choices: ["create", "update"],
    description:
      "Restrict to 'create' (backfill missing current-period credits only) or " +
      "'update' (only realign drifted credits' expiration date); omit to do both",
  },
};

const FREE_RENEWAL_INVOICE_ID_PREFIX = "free-renewal-";
const REALIGNMENT_TOLERANCE_MS = 60 * 60 * 1000;

// Only credits from the recurring-renewal mechanism are in scope here —
// one-off manual grants (invoiceOrLineItemId prefixed "free-poke-", from the
// poke plugin) must never be read as, or realigned into, the renewal cadence.
function isStartedFreeCredit(
  credit: CreditResource
): credit is StartedFreeCredit {
  return (
    credit.type === "free" &&
    credit.startDate !== null &&
    credit.expirationDate !== null &&
    (credit.invoiceOrLineItemId?.startsWith(FREE_RENEWAL_INVOICE_ID_PREFIX) ??
      false)
  );
}

function findActiveCredit(
  credits: StartedFreeCredit[],
  now: Date
): StartedFreeCredit | null {
  return (
    credits.find(
      (credit) => credit.startDate <= now && now < credit.expirationDate
    ) ?? null
  );
}

// Negotiated deals override the bracket formula with a fixed full-period
// amount (see ProgrammaticUsageConfiguration.freeCreditMicroUsd); only fall
// back to the bracket calculation when no override is configured. Mirrors
// the amount logic in `handleFreeCreditSegmentGrant`.
async function computeFreeCreditAmountMicroUsd({
  auth,
  workspace,
  subscription,
}: {
  auth: Authenticator;
  workspace: WorkspaceResource;
  subscription: Stripe.Subscription;
}): Promise<number> {
  const programmaticConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (programmaticConfig && programmaticConfig.freeCreditMicroUsd !== null) {
    return programmaticConfig.freeCreditMicroUsd;
  }

  const isAnnual =
    subscription.items.data[0]?.price.recurring?.interval === "year";
  const userCount = await countEligibleUsersForFreeCredits(workspace);
  const monthlyAmountMicroUsd = calculateFreeCreditAmountMicroUsd(userCount);
  return isAnnual
    ? monthlyAmountMicroUsd * YEARLY_MULTIPLIER
    : monthlyAmountMicroUsd;
}

makeScript(
  argumentSpecs,
  async ({ planCode, workspaceId, mode, execute }, scriptLogger) => {
    let targetWorkspaceModelId: number | null = null;
    if (workspaceId) {
      const targetWorkspace = await WorkspaceResource.fetchById(workspaceId);
      if (!targetWorkspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      targetWorkspaceModelId = targetWorkspace.id;
    }

    const activeSubscriptions =
      await SubscriptionResource.internalListAllActiveNoFreeTestPlan();

    // Metronome-only (fully shadow-billed or enterprise) subscriptions have no
    // Stripe period to realign against — Stripe billing periods are what this
    // script anchors on. Restricted to legacy PRO_/ENT_ plan codes regardless
    // of `planCode`: the free-recurring-credit mechanism this script realigns
    // was never granted on other (e.g. new-pricing CP_*) plans.
    const subscriptions = activeSubscriptions.filter((subscription) => {
      const code = subscription.getPlan().code;
      return (
        subscription.stripeSubscriptionId !== null &&
        (code.startsWith("PRO_") || code.startsWith("ENT_")) &&
        (!planCode || code === planCode) &&
        (targetWorkspaceModelId === null ||
          subscription.workspaceId === targetWorkspaceModelId)
      );
    });

    scriptLogger.info(
      {
        activeSubscriptionCount: activeSubscriptions.length,
        matchingSubscriptionCount: subscriptions.length,
        planCode: planCode ?? null,
        workspaceId: workspaceId ?? null,
        mode: mode ?? "create+update",
        execute,
      },
      "Re-aligning free credits onto Stripe billing periods"
    );

    const rows = await concurrentExecutor(
      subscriptions,
      async (subscriptionResource): Promise<ResultRow | null> => {
        const { stripeSubscriptionId } = subscriptionResource;
        if (!stripeSubscriptionId) {
          return null;
        }

        const subscription = await getStripeSubscription(stripeSubscriptionId);
        if (!subscription) {
          scriptLogger.warn(
            { stripeSubscriptionId },
            "Could not retrieve Stripe subscription"
          );
          return null;
        }

        const [workspace] = await WorkspaceResource.fetchByModelIds([
          subscriptionResource.workspaceId,
        ]);
        if (!workspace) {
          scriptLogger.warn(
            {
              stripeSubscriptionId,
              workspaceModelId: subscriptionResource.workspaceId,
            },
            "Could not find workspace for subscription"
          );
          return null;
        }

        // Metronome is dead/archived for these workspaces, so Stripe's own
        // period is now the only source of truth for the credit cadence. Use
        // the exact (unrounded) Stripe timestamps — matching what
        // `grantFreeCreditsFromSubscriptionStateChange` uses for its own
        // periodStart/periodEnd — so a realigned credit's boundary is
        // identical to what the webhook itself would set.
        const periodStart = new Date(subscription.current_period_start * 1000);
        const periodEnd = new Date(subscription.current_period_end * 1000);

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const freeCredits = (await CreditResource.listAll(auth)).filter(
          isStartedFreeCredit
        );

        const actions: RealignmentAction[] = [];
        const now = new Date();
        const currentCredit = findActiveCredit(freeCredits, now);

        if (!currentCredit) {
          // No credit currently covers today: back-fill the one that should be
          // active, covering Stripe's current period end-to-end.
          if (mode !== "update") {
            const amountMicroUsd = await computeFreeCreditAmountMicroUsd({
              auth,
              workspace,
              subscription,
            });
            actions.push({
              type: "create_current_period_credit",
              startDate: periodStart,
              expirationDate: periodEnd,
              amountMicroUsd,
            });
          }
        } else if (
          mode !== "create" &&
          Math.abs(
            currentCredit.expirationDate.getTime() - periodEnd.getTime()
          ) > REALIGNMENT_TOLERANCE_MS
        ) {
          // The active credit's cadence has drifted from Stripe's period by
          // more than an hour: snap its end date to the exact Stripe boundary.
          // Smaller differences (clock/webhook-timing skew) are left alone.
          // Do NOT pre-create the next period's credit here — the Stripe
          // `customer.subscription.updated` webhook (post #28450) grants it
          // automatically once that period actually begins. Pre-creating it
          // would both be premature (dated in the future) and use a different
          // idempotency key than the webhook's (`free-renewal-{workspaceId}-*`
          // here vs. `free-renewal-{stripeSubscriptionId}-{rawPeriodStart}`
          // there), so the webhook wouldn't recognize it and would grant a
          // duplicate.
          actions.push({
            type: "update_expiration_date",
            creditId: currentCredit.id,
            expirationDate: periodEnd,
          });
        }

        if (actions.length === 0) {
          return null;
        }

        for (const action of actions) {
          switch (action.type) {
            case "create_current_period_credit": {
              const idempotencyKey = `${FREE_RENEWAL_INVOICE_ID_PREFIX}${
                workspace.sId
              }-${Math.floor(action.startDate.getTime() / 1000)}`;
              scriptLogger.info(
                {
                  workspaceId: workspace.sId,
                  stripeSubscriptionId,
                  execute,
                  startDate: action.startDate.toISOString(),
                  expirationDate: action.expirationDate.toISOString(),
                  amountMicroUsd: action.amountMicroUsd,
                },
                `[${execute ? "EXECUTE" : "DRY RUN"}] Create free credit`
              );
              if (execute) {
                const { credit, created } =
                  await CreditResource.makeNewOrFetchByInvoiceOrLineItemId(
                    auth,
                    {
                      type: "free",
                      initialAmountMicroUsd: action.amountMicroUsd,
                      consumedAmountMicroUsd: 0,
                      discount: null,
                      invoiceOrLineItemId: idempotencyKey,
                      metronomeCreditId: null,
                    }
                  );
                if (created) {
                  const startResult = await credit.start(auth, {
                    startDate: action.startDate,
                    expirationDate: action.expirationDate,
                  });
                  if (startResult.isErr()) {
                    scriptLogger.error(
                      {
                        workspaceId: workspace.sId,
                        stripeSubscriptionId,
                        error: startResult.error.message,
                      },
                      "Failed to start realignment free credit"
                    );
                  }
                }
              }
              break;
            }
            case "update_expiration_date": {
              scriptLogger.info(
                {
                  workspaceId: workspace.sId,
                  stripeSubscriptionId,
                  execute,
                  creditId: action.creditId,
                  expirationDate: action.expirationDate.toISOString(),
                },
                `[${execute ? "EXECUTE" : "DRY RUN"}] Update free credit expiration date`
              );
              if (execute && currentCredit) {
                await currentCredit.updateExpirationDate(
                  auth,
                  action.expirationDate
                );
              }
              break;
            }
          }
        }

        return {
          stripeSubscriptionId,
          workspaceId: workspace.sId,
          workspaceName: workspace.name,
          actions: actions.map((a) => a.type).join("|"),
        };
      },
      { concurrency: 4 }
    );

    const sortedRows = rows
      .filter((row): row is ResultRow => row !== null)
      .sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));

    console.log("stripeSubscriptionId,workspaceId,workspaceName,actions");
    for (const row of sortedRows) {
      console.log(
        `${row.stripeSubscriptionId},${row.workspaceId},"${row.workspaceName}",${row.actions}`
      );
    }
  }
);
