import { Hono } from "hono";

import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import {
  getSeatPlan,
  getSeatPlanApiError,
} from "@app/lib/api/credits/seat_plan";

import { jsonApiError } from "@front-api/middleware/utils";

export type GetSeatPlanResponseBody = SeatPlanResponseBody;

// Mounted at /api/w/:wId/seats/plan.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  const result = await getSeatPlan(auth);
  if (result.isErr()) {
    return jsonApiError(c, getSeatPlanApiError(result.error));
  }

  const body: GetSeatPlanResponseBody = result.value;
  return c.json(body);
});

export default app;
