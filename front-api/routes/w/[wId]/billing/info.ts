import {
  type GetBillingInfoResponseBody,
  getWorkspaceBillingInfo,
} from "@app/lib/api/billing/info";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/billing/info.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetBillingInfoResponseBody> => {
    const auth = ctx.get("auth");

    const result = await getWorkspaceBillingInfo(auth);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: `Failed to fetch Stripe billing information: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ billingInfo: result.value });
  }
);

export default app;
