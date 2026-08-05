import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ConsumptionQuerySchema,
  toConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopResponse } from "@app/lib/api/analytics/consumption/top";
import {
  CONSUMPTION_TOP_DIMENSIONS,
  DEFAULT_CONSUMPTION_TOP_LIMIT,
  fetchConsumptionTop,
} from "@app/lib/api/analytics/consumption/top";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetConsumptionTopResponse };

const QuerySchema = ConsumptionQuerySchema.extend({
  dimension: z.enum(CONSUMPTION_TOP_DIMENSIONS),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(DEFAULT_CONSUMPTION_TOP_LIMIT),
});

// Mounted at /api/w/:wId/analytics/consumption/top.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", ensureIsManager(), validate("query", QuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { dimension, limit, filter, ...periodQuery } = ctx.req.valid("query");

  const period = await resolveConsumptionPeriod(
    auth,
    toConsumptionPeriodInput(periodQuery)
  );

  const result = await fetchConsumptionTop(auth, {
    dimension,
    period,
    limit,
    filter,
  });
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve top ${dimension}: ${result.error.message}`,
      },
    });
  }

  const body: GetConsumptionTopResponse = result.value;
  return ctx.json(body);
});

export default app;
