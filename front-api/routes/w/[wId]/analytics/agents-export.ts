import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import {
  AGENT_EXPORT_HEADERS,
  fetchAgentExportRows,
} from "@app/lib/api/analytics/agents_export";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
});

// Mounted at /api/w/:wId/analytics/agents-export.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasPermission("workspace:view_analytics"),
  validate("query", QuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const { days } = ctx.req.valid("query");
    const owner = auth.getNonNullableWorkspace();

    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: owner.sId,
      days,
    });

    const result = await fetchAgentExportRows(baseQuery, auth, true);

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve agent analytics: ${result.error.message}`,
        },
      });
    }

    const csvData = result.value.map((row) =>
      AGENT_EXPORT_HEADERS.map((h) => row[h])
    );
    const csv = stringify([AGENT_EXPORT_HEADERS, ...csvData], {
      header: false,
    });

    ctx.header("Content-Type", "text/csv");
    ctx.header(
      "Content-Disposition",
      `attachment; filename="dust_agents_last_${days}_days.csv"`
    );
    return ctx.body(csv);
  }
);

export default app;
