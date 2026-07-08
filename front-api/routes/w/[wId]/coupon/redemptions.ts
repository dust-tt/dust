import type { WorkspaceCouponsError } from "@app/lib/api/coupons";
import { getWorkspaceCoupons } from "@app/lib/api/coupons";
import type { GetWorkspaceCouponsResponseBody } from "@app/types/api/coupons";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

function couponsErrorToApi(ctx: Context, err: WorkspaceCouponsError) {
  switch (err.type) {
    case "not_configured":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Workspace is not configured for Metronome billing.",
        },
      });
    case "credits_fetch_failed":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome credits: ${err.cause?.message ?? ""}`,
        },
      });
    default:
      assertNever(err.type);
  }
}

// Mounted at /api/w/:wId/coupon/redemptions.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceCouponsResponseBody> => {
    const auth = ctx.get("auth");

    const result = await getWorkspaceCoupons(auth);
    if (result.isErr()) {
      return couponsErrorToApi(ctx, result.error);
    }
    return ctx.json(result.value);
  }
);

export default app;
