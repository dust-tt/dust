import { getCheckSummaries } from "@app/lib/api/poke/production_checks";
import type { GetProductionChecksResponseBody } from "@app/types/api/poke/production_checks";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import checkName from "./[checkName]";
import run from "./run";

// Mounted at /api/poke/production-checks.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetProductionChecksResponseBody> => {
  const checks = await getCheckSummaries();
  return ctx.json({ checks });
});

app.route("/run", run);
app.route("/:checkName", checkName);

export default app;
