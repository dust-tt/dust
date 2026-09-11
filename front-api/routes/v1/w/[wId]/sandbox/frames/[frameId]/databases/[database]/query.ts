import { queryFrameDatabase } from "@app/lib/api/frames/databases";
import { isValidPodDatabaseName } from "@app/lib/api/sandbox/db";
import type { QueryDatabaseResult } from "@app/lib/api/sandbox_functions/dsbx_db";
import { sandboxFrameApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const DatabaseParamsSchema = z.object({
  database: z.string().refine(isValidPodDatabaseName),
});

const FrameDatabaseQueryRequestSchema = z.object({
  sql: z.string().min(1),
});

// Mounted at /api/v1/w/:wId/sandbox/frames/:frameId/databases/:database/query. Authorization is
// applied by the `databases` directory index.
const app = sandboxFrameApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("param", DatabaseParamsSchema),
  validate("json", FrameDatabaseQueryRequestSchema),
  async (ctx): HandlerResult<QueryDatabaseResult> => {
    const result = await queryFrameDatabase(ctx.get("auth"), ctx.get("frame"), {
      database: ctx.req.valid("param").database,
      sql: ctx.req.valid("json").sql,
    });
    if (result.isErr()) {
      const isBadQuery = result.error.code === "reconcile_blocked";
      return apiError(
        ctx,
        {
          status_code: isBadQuery ? 400 : 500,
          api_error: {
            type: isBadQuery
              ? "invalid_request_error"
              : "internal_server_error",
            message: result.error.message,
          },
        },
        result.error
      );
    }

    return ctx.json(result.value, 200);
  }
);

export default app;
