import { getInvoicePaymentUrl } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  CreditDisplayData,
  GetCreditsResponseBody,
  PendingCreditData,
} from "@app/types/credits";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";

import awuPoolSummary from "./awu-pool-summary";
import membersSeats from "./members-seats";
import membersUsage from "./members-usage";
import metronomeBalances from "./metronome-balances";

// Mounted at /api/w/:wId/credits.
const app = workspaceApp();

app.route("/awu-pool-summary", awuPoolSummary);
app.route("/members-seats", membersSeats);
app.route("/members-usage", membersUsage);
app.route("/metronome-balances", metronomeBalances);

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can view credits.",
      },
    });
  }

  const credits = await CreditResource.listAll(auth, {
    includeBuyer: true,
  });

  const creditsData: CreditDisplayData[] = credits
    .filter((credit) => credit.startDate !== null && credit.type !== "excess")
    .map((credit) => credit.toJSON());

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
  };
  return ctx.json(body);
});

export default app;
