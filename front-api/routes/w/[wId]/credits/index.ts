import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import { getInvoicePaymentUrl } from "@app/lib/plans/stripe";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  CreditDisplayData,
  GetCreditsResponseBody,
  PendingCreditData,
} from "@app/types/credits";

import awuPoolSummary from "./awu-pool-summary";
import membersUsage from "./members-usage";
import metronomeBalances from "./metronome-balances";

// Mounted at /api/w/:wId/credits.
//
// Mixed auth: children are mounted BEFORE the `app.use(...)` so they're
// untouched by the workspaceAuth declared here (each child declares its
// own). The root GET handler (registered after) gets the loose variant.
const app = new Hono();

app.route("/awu-pool-summary", awuPoolSummary);
app.route("/members-usage", membersUsage);
app.route("/metronome-balances", metronomeBalances);

app.use("*", workspaceAuth({ doesNotRequireCanUseProduct: true }));

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
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
  return c.json(body);
});

export default app;
