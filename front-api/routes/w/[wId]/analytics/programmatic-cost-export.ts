import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

import {
  ExportQuerySchema,
  getProgrammaticCostExport,
} from "@app/lib/api/analytics/programmatic_cost_export";

// Mounted at /api/w/:wId/analytics/programmatic-cost-export.
const app = new Hono();

app.get("/", validate("query", ExportQuerySchema), async (c) => {
  const auth = c.get("auth");
  const query = c.req.valid("query");

  const result = await getProgrammaticCostExport(auth, query);

  if (result.isErr()) {
    return apiError(c, {
      status_code: result.error.status,
      api_error: result.error.error,
    });
  }

  const { csv, filename } = result.value;
  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename=${filename}`);
  return c.body(csv);
});

export default app;
