import {
  type GetMetronomeUsageResponse,
  getMetronomeUsage,
  MetronomeUsageQuerySchema,
} from "@app/lib/api/analytics/metronome_usage";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetMetronomeUsageResponse };

// Mounted at /api/w/:wId/analytics/metronome-usage.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("query", MetronomeUsageQuerySchema), async (ctx) => {
  const auth = ctx.get("auth");

  const result = await getMetronomeUsage(auth, ctx.req.valid("query"));
  if (result.isErr()) {
    const err = result.error;
    switch (err.type) {
      case "metronome_not_configured":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Workspace is not configured for Metronome billing.",
          },
        });
      case "invalid_group_key":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              `Grouping by "${err.groupBy}" is not available. The billable metric ` +
              `must have "${err.eventProperty}" configured as a group key in Metronome.`,
          },
        });
      case "internal_error":
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: err.message,
          },
        });
      default:
        assertNever(err);
    }
  }

  return ctx.json(result.value);
});

export default app;
