import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { getInvoicePaymentUrl } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  CreditDisplayData,
  GetCreditsResponseBody,
  PendingCreditData,
} from "@app/types/credits";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";

import awuPoolCurrentCycle from "./awu-pool-current-cycle";
import awuPoolCycleHistory from "./awu-pool-cycle-history";
import awuPoolSummary from "./awu-pool-summary";
import membersSeats from "./members-seats";
import membersUsage from "./members-usage";
import myTopConversations from "./my-top-conversations";
import myUsage from "./my-usage";
import myUsageAnalytics from "./my-usage-analytics";
import purchase from "./purchase";
import topUps from "./top-ups";
import upgradeRequests from "./upgrade-requests";
import usageConfiguration from "./usage-configuration";

// Mounted at /api/w/:wId/credits.
const app = workspaceApp();

app.route("/awu-pool-summary", awuPoolSummary);
app.route("/awu-pool-current-cycle", awuPoolCurrentCycle);
app.route("/awu-pool-cycle-history", awuPoolCycleHistory);
app.route("/members-seats", membersSeats);
app.route("/members-usage", membersUsage);
app.route("/my-top-conversations", myTopConversations);
app.route("/my-usage", myUsage);
app.route("/my-usage-analytics", myUsageAnalytics);
app.route("/purchase", purchase);
app.route("/top-ups", topUps);
app.route("/upgrade-requests", upgradeRequests);
app.route("/usage-configuration", usageConfiguration);

/** @ignoreswagger */
app.get("/", ensureIsAdmin(), async (ctx) => {
  const auth = ctx.get("auth");

  const credits = await CreditResource.listAll(auth, {
    includeBuyer: true,
  });

  const creditsData: CreditDisplayData[] = credits
    .filter((credit) => credit.startDate !== null && credit.type !== "excess")
    .map((credit) => credit.toJSON());

  const nowMs = Date.now();
  const recurringFreeCreditRenewalDateMs = credits.reduce<number | null>(
    (earliestExpirationDateMs, credit) => {
      if (
        credit.type !== "free" ||
        !credit.invoiceOrLineItemId?.startsWith("free-renewal-") ||
        !credit.startDate ||
        credit.startDate.getTime() > nowMs ||
        !credit.expirationDate ||
        credit.expirationDate.getTime() <= nowMs
      ) {
        return earliestExpirationDateMs;
      }

      const expirationDateMs = credit.expirationDate.getTime();
      return earliestExpirationDateMs === null ||
        expirationDateMs < earliestExpirationDateMs
        ? expirationDateMs
        : earliestExpirationDateMs;
    },
    null
  );

  // Credit-priced plans renew AWU allocations, not legacy USD free credits.
  // Migrated workspaces can retain active `free-renewal-*` rows, so only use
  // those rows as the renewal source while the workspace is on a legacy plan.
  const freeCreditRenewalDateMs = isCreditPricedPlanPrefix(
    auth.getNonNullablePlan().code
  )
    ? null
    : recurringFreeCreditRenewalDateMs;

  const pendingCommittedCredits = credits.filter(
    (credit) =>
      credit.startDate === null &&
      credit.type === "committed" &&
      credit.invoiceOrLineItemId !== null
  );

  const pendingCreditsData: PendingCreditData[] = await concurrentExecutor(
    pendingCommittedCredits,
    async (credit) => {
      const paymentUrl = credit.invoiceOrLineItemId
        ? await getInvoicePaymentUrl(credit.invoiceOrLineItemId)
        : null;
      return {
        sId: credit.sId,
        type: credit.type,
        initialAmountMicroUsd: credit.initialAmountMicroUsd,
        paymentUrl,
        createdAt: credit.createdAt.getTime(),
      };
    },
    { concurrency: 8 }
  );

  const body: GetCreditsResponseBody = {
    credits: creditsData,
    pendingCredits:
      pendingCreditsData.length > 0 ? pendingCreditsData : undefined,
    freeCreditRenewalDateMs: freeCreditRenewalDateMs ?? undefined,
  };
  return ctx.json(body);
});

export default app;
