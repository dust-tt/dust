import {
  fetchConsumptionExportRows,
  rowsToCsvString,
  rowsToNdjson,
} from "@app/lib/api/analytics/consumption/export_lines";
import logger from "@app/logger/logger";
import { PostConsumptionExportRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/v1/w/:wId/analytics/consumption/export.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/analytics/consumption/export:
 *   post:
 *     summary: Export consumption analytics
 *     description: |
 *       Export per-call consumption analytics for the workspace identified by {wId}.
 *       Each row represents one unit of billed credit consumption (an LLM call or a tool call).
 *       The export can be filtered by various dimensions (agents, users, API keys, groups, models, tools, skills, sources, tags).
 *       The export is limited to a maximum of 30 days per request.
 *     tags:
 *       - Analytics
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Start of the time range (inclusive), ISO 8601 datetime
 *                 example: "2026-01-01T00:00:00Z"
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: End of the time range (exclusive), ISO 8601 datetime. Must be after startDate, at most 30 days apart.
 *                 example: "2026-01-15T00:00:00Z"
 *               format:
 *                 type: string
 *                 enum: [csv, ndjson]
 *                 description: Output format (defaults to csv)
 *               filter:
 *                 type: object
 *                 description: Optional dimension filters. Each key maps to an array of string identifiers to include.
 *                 properties:
 *                   agents:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Agent sIds to filter on
 *                   users:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: User IDs to filter on
 *                   api_keys:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: API key names to filter on
 *                   groups:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Group IDs to filter on
 *                   models:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Model IDs to filter on
 *                   tools:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Tool server names to filter on
 *                   skills:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Skill IDs to filter on
 *                   sources:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Context origins to filter on (e.g. "web", "slack", "api")
 *                   tags:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Agent tag IDs to filter on
 *     responses:
 *       200:
 *         description: The consumption data in CSV or NDJSON format
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/x-ndjson:
 *             schema:
 *               type: string
 *               description: Newline-delimited JSON, one row object per line
 *       400:
 *         description: Invalid request body (missing fields, invalid dates, range exceeds 30 days)
 *       403:
 *         description: Requires an API key with admin scope
 *       500:
 *         description: Internal Server Error
 */
app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostConsumptionExportRequestSchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    if (!(await auth.hasFeatureFlag("consumption_export_api"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message:
            "The workspace does not have access to the consumption export API.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const format = body.format ?? "csv";

    const startDate = new Date(body.startDate).toISOString();
    const endDate = new Date(body.endDate).toISOString();

    const owner = auth.getNonNullableWorkspace();

    logger.info(
      {
        workspaceId: owner.sId,
        startDate,
        endDate,
        format,
        hasFilter: !!body.filter,
      },
      "Consumption export requested."
    );

    const result = await fetchConsumptionExportRows(auth, {
      period: { startDate, endDate },
      filter: body.filter,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    if (format === "ndjson") {
      ctx.header("Content-Type", "application/x-ndjson");
      ctx.header(
        "Content-Disposition",
        `attachment; filename="dust_consumption_${body.startDate}_${body.endDate}.ndjson"`
      );
      return ctx.body(rowsToNdjson(result.value));
    }

    ctx.header("Content-Type", "text/csv");
    ctx.header(
      "Content-Disposition",
      `attachment; filename="dust_consumption_${body.startDate}_${body.endDate}.csv"`
    );
    return ctx.body(rowsToCsvString(result.value));
  }
);

app.all("/", (ctx) =>
  apiError(ctx, {
    status_code: 405,
    api_error: {
      type: "method_not_supported_error",
      message: "The method passed is not supported, POST is expected.",
    },
  })
);

export default app;
