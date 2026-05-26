import { getFeatureFlags } from "@app/lib/auth";
import { getConversationsDataRetention } from "@app/lib/data_retention";
import { unsafeGetUsageData } from "@app/lib/workspace_usage";
import { getWorkspaceUsageRetentionErrorMessage } from "@app/lib/workspace_usage_retention";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD" });

const GetWorkspaceUsageSchema = z.object({
  start_date: DateString,
  end_date: DateString.nullish(),
});

// Mounted at /api/v1/w/:wId/usage. publicApiAuth is applied by the parent
// v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

/**
 * @ignoreswagger
 * Deprecated: this endpoint will be removed after 2026-06-01.
 * Use GET /api/v1/w/{wId}/analytics/export instead.
 */
app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(auth);
  if (!flags.includes("usage_data_api")) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The workspace does not have access to the usage data API.",
      },
    });
  }

  const queryValidation = GetWorkspaceUsageSchema.safeParse(ctx.req.query());
  if (!queryValidation.success) {
    return apiError(ctx, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request query: ${fromError(queryValidation.error).toString()}`,
      },
      status_code: 400,
    });
  }

  const query = queryValidation.data;
  const startDate = new Date(query.start_date);
  const endDate = query.end_date ? new Date(query.end_date) : new Date();
  const conversationsRetentionDays = await getConversationsDataRetention(auth);
  const retentionErrorMessage = getWorkspaceUsageRetentionErrorMessage({
    startDate,
    retentionDays: conversationsRetentionDays,
  });
  if (retentionErrorMessage) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: retentionErrorMessage,
      },
    });
  }

  const csvData = await unsafeGetUsageData(startDate, endDate, owner);
  ctx.header("Content-Type", "text/csv");
  return ctx.body(csvData);
});

export default app;
