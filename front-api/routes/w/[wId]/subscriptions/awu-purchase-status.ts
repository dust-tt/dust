import type { GetAwuPurchaseStatusResponseBody } from "@app/lib/credits/awu_purchase_status";
import { getAwuPurchaseAttempt } from "@app/lib/credits/awu_purchase_status";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/subscriptions/awu-purchase-status.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetAwuPurchaseStatusResponseBody> => {
    const auth = ctx.get("auth");

    const attempt = await getAwuPurchaseAttempt(
      auth.getNonNullableWorkspace().sId
    );
    return ctx.json({ attempt });
  }
);

export default app;
