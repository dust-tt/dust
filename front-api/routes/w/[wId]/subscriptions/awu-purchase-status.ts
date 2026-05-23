import type { AwuPurchaseAttempt } from "@app/lib/credits/awu_purchase_status";
import { getAwuPurchaseAttempt } from "@app/lib/credits/awu_purchase_status";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type GetAwuPurchaseStatusResponseBody = {
  attempt: AwuPurchaseAttempt | null;
};

// Mounted at /api/w/:wId/subscriptions/awu-purchase-status.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetAwuPurchaseStatusResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can check AWU purchase status.",
      },
    });
  }

  const attempt = await getAwuPurchaseAttempt(
    auth.getNonNullableWorkspace().sId
  );
  return ctx.json({ attempt });
});

export default app;
