import type {
  SeatPlanError,
  SeatPlanResponseBody,
} from "@app/lib/api/credits/seat_plan";
import { getSeatPlan } from "@app/lib/api/credits/seat_plan";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

function seatPlanErrorToApi(ctx: Context, err: SeatPlanError) {
  switch (err.type) {
    case "not_configured":
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "internal_server_error",
          message: "Workspace is not configured for Metronome billing.",
        },
      });
    case "currency_resolution_failed":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to resolve currency for seat plan.",
        },
      });
    case "rate_schedule_fetch_failed":
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to fetch rate schedule for seat products.",
        },
      });
    default:
      assertNever(err.type);
  }
}

// Mounted at /api/w/:wId/seats/plan.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<SeatPlanResponseBody> => {
  const auth = ctx.get("auth");

  const result = await getSeatPlan(auth);
  if (result.isErr()) {
    return seatPlanErrorToApi(ctx, result.error);
  }
  return ctx.json(result.value);
});

export default app;
