import {
  type GetBillingInvoicesResponseBody,
  listRecentBillingInvoices,
} from "@app/lib/api/billing/invoices";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/billing/invoices.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetBillingInvoicesResponseBody> => {
    const auth = ctx.get("auth");

    const result = await listRecentBillingInvoices(auth);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: `Failed to fetch Stripe billing invoices: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ billingInvoices: result.value });
  }
);

export default app;
