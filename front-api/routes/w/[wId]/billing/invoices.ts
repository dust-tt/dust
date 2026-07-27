import { listRecentBillingInvoices } from "@app/lib/api/billing/invoices";
import type { GetBillingInvoicesResponseBody } from "@app/types/api/billing/invoices";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/billing/invoices.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetBillingInvoicesResponseBody> => {
  const auth = ctx.get("auth");

  if (!(await auth.hasWorkspacePermission("admin", "billing"))) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "You need billing access to manage billing settings, invoices, and payment methods.",
      },
    });
  }

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
});

export default app;
