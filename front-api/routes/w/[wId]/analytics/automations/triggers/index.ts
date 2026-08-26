import { AutomationTriggersBodySchema } from "@app/lib/api/analytics/automations/schema";
import type {
  AutomationTriggerRow,
  GetAutomationTriggersResponse,
} from "@app/lib/api/analytics/automations/triggers";
import { fetchAutomationTriggers } from "@app/lib/api/analytics/automations/triggers";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import { CARDINALITY_PRECISION_THRESHOLD } from "@app/lib/api/analytics/consumption/scope";
import { rowsToCsv } from "@app/lib/api/analytics/csv_utils";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsManager } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import tId from "./[tId]";

export type { GetAutomationTriggersResponse };

// Mounted at /api/w/:wId/analytics/automations/triggers.
const app = workspaceApp();

const CSV_HEADERS = [
  "name",
  "type",
  "status",
  "agent",
  "editor",
  "editorEmail",
  "runs",
  "credits",
  "pool",
] as const;

function kindToLabel(kind: AutomationTriggerRow["kind"]): string {
  switch (kind) {
    case "schedule":
      return "Schedule";
    case "webhook":
      return "Webhook";
    default:
      return assertNever(kind);
  }
}

function toCsvRow(trigger: AutomationTriggerRow) {
  return {
    name: trigger.name,
    type: kindToLabel(trigger.kind),
    status: trigger.status,
    agent: trigger.agent.name,
    editor: trigger.editor.name,
    editorEmail: trigger.editor.email ?? "",
    runs: trigger.runCount,
    credits: trigger.credits,
    pool: trigger.executionMode,
  };
}

/** @ignoreswagger */
app.post(
  "/",
  ensureIsManager(),
  validate("json", AutomationTriggersBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { limit, offset, search, filter, format, ...periodQuery } =
      ctx.req.valid("json");

    const period = await resolveConsumptionPeriod(
      auth,
      toConsumptionPeriodInput(periodQuery)
    );

    // The ranking behind this query is already capped at
    // CARDINALITY_PRECISION_THRESHOLD buckets, so requesting that many rows
    // in one page returns every trigger the paginated view could ever show.
    const result = await fetchAutomationTriggers(auth, {
      period,
      limit: format === "csv" ? CARDINALITY_PRECISION_THRESHOLD : limit,
      offset: format === "csv" ? 0 : offset,
      search,
      filter,
    });
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: result.error,
        },
        "[AutomationsAnalytics] Failed to retrieve triggers."
      );
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to retrieve triggers.",
        },
      });
    }

    switch (format) {
      case "json":
        return ctx.json(result.value);
      case "csv": {
        const exportDate = new Date().toISOString().slice(0, 10);
        ctx.header("Content-Type", "text/csv");
        ctx.header(
          "Content-Disposition",
          `attachment; filename="dust_automations_${exportDate}.csv"`
        );
        return ctx.body(
          rowsToCsv(CSV_HEADERS, result.value.triggers.map(toCsvRow))
        );
      }
      default:
        return assertNever(format);
    }
  }
);

app.route("/:tId", tId);

export default app;
