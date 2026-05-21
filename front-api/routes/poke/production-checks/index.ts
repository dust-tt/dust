import { getCheckSummaries } from "@app/lib/api/poke/production_checks";
import type { CheckSummary } from "@app/types/production_checks";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

import checkName from "./[checkName]";

export type GetProductionChecksResponseBody = {
  checks: CheckSummary[];
};

// Mounted at /api/poke/production-checks.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetProductionChecksResponseBody> => {
  const checks = await getCheckSummaries();
  return ctx.json({ checks });
});

app.route("/:checkName", checkName);

export default app;
