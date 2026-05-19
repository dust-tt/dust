import { Hono } from "hono";

import type { GetMetronomeUsageResponse } from "@app/lib/api/analytics/metronome_usage";
import {
  getMetronomeUsage,
  getMetronomeUsageApiError,
  MetronomeUsageQuerySchema,
} from "@app/lib/api/analytics/metronome_usage";

import { jsonApiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

export type GetMetronomeUsageResponseBody = GetMetronomeUsageResponse;

// Mounted at /api/w/:wId/analytics/metronome-usage.
const app = new Hono();

app.get("/", validate("query", MetronomeUsageQuerySchema), async (c) => {
  const auth = c.get("auth");
  const query = c.req.valid("query");

  const result = await getMetronomeUsage(auth, query);
  if (result.isErr()) {
    return jsonApiError(c, getMetronomeUsageApiError(result.error));
  }

  const body: GetMetronomeUsageResponseBody = result.value;
  return c.json(body);
});

export default app;
