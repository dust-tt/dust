import { getCheckSummaries } from "@app/lib/api/poke/production_checks";
import type { CheckSummary } from "@app/types/production_checks";
import { pokeApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

import checkName from "./[checkName]";

export type GetProductionChecksResponseBody = {
  checks: CheckSummary[];
};

// Mounted at /api/poke/production-checks.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<GetProductionChecksResponseBody> => {
  const checks = await getCheckSummaries();
  return ctx.json({ checks });
});

app.route("/:checkName", checkName);

export default app;
