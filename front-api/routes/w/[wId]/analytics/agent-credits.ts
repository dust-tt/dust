import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import type { GetAgentCreditsResponse } from "@app/lib/api/assistant/observability/agent_credits";
import { fetchAgentCreditBreakdown } from "@app/lib/api/assistant/observability/agent_credits";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasPermission } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { GetAgentCreditsResponse };

const CSV_HEADERS = [
  "agent",
  "model",
  "credits",
  "description",
  "topUsers",
  "topSkills",
] as const;

const QuerySchema = z.object({
  days: z.coerce.number().positive().optional().default(DEFAULT_PERIOD_DAYS),
  limit: z.coerce.number().positive().max(200).optional().default(100),
  search: z.string().optional(),
  format: z.enum(["json", "csv"]).optional().default("json"),
});

const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasPermission("workspace:view_analytics"),
  validate("query", QuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { days, limit, search, format } = ctx.req.valid("query");

    const result = await fetchAgentCreditBreakdown(auth, {
      days,
      limit,
      search,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve agent credits: ${result.error.message}`,
        },
      });
    }

    if (format === "json") {
      const body: GetAgentCreditsResponse = { agents: result.value };
      return ctx.json(body);
    }

    const rows = result.value.map((row) => ({
      agent: row.name,
      model: row.modelDisplayName,
      credits: row.credits,
      description: row.description,
      topUsers: row.topUsers.map((user) => user.name).join("; "),
      topSkills: row.topSkills.map((skill) => skill.name).join("; "),
    }));

    ctx.header("Content-Type", "text/csv");
    ctx.header(
      "Content-Disposition",
      `attachment; filename="dust_agents_by_credits_last_${days}_days.csv"`
    );
    return ctx.body(rowsToCsv(CSV_HEADERS, rows));
  }
);

export default app;
