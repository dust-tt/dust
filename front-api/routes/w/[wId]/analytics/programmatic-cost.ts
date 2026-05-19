import { Hono } from "hono";

import type { GetWorkspaceProgrammaticCostResponse } from "@app/lib/api/analytics/programmatic_cost";
import {
  getProgrammaticCost,
  getProgrammaticCostApiError,
  ProgrammaticCostQuerySchema,
} from "@app/lib/api/analytics/programmatic_cost";

import { jsonApiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

export type GetProgrammaticCostResponseBody =
  GetWorkspaceProgrammaticCostResponse;

// Mounted at /api/w/:wId/analytics/programmatic-cost.
const app = new Hono();

app.get("/", validate("query", ProgrammaticCostQuerySchema), async (c) => {
  const auth = c.get("auth");
  const query = c.req.valid("query");

  const result = await getProgrammaticCost(auth, query);
  if (result.isErr()) {
    return jsonApiError(c, getProgrammaticCostApiError(result.error));
  }

  const body: GetProgrammaticCostResponseBody = result.value;
  return c.json(body);
});

export default app;
