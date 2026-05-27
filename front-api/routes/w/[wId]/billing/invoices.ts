import {
  type GetBillingInvoicesResponseBody,
  listRecentBillingInvoices,
} from "@app/lib/api/billing/invoices";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/billing/invoices.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetBillingInvoicesResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
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
