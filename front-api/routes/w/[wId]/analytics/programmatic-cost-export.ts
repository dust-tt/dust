import {
  ExportQuerySchema,
  getProgrammaticCostExport,
} from "@app/lib/api/analytics/programmatic_cost_export";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted at /api/w/:wId/analytics/programmatic-cost-export.
const app = new Hono();

app.get("/", validate("query", ExportQuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const query = ctx.req.valid("query");

  const result = await getProgrammaticCostExport(auth, query);

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: result.error.status,
      api_error: result.error.error,
    });
  }

  const { csv, filename } = result.value;
  ctx.header("Content-Type", "text/csv");
  ctx.header("Content-Disposition", `attachment; filename=${filename}`);
  return ctx.body(csv);
});

export default app;
