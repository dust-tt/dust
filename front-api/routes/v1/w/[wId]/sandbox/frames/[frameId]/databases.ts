import { isValidPodDatabaseName } from "@app/lib/api/sandbox/db";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import {
  type LiveDatabaseEntry,
  listDatabasesOnReadySandbox,
  type QueryDatabaseResult,
  queryDatabaseOnReadySandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { sandboxFrameApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const FrameDatabaseQueryRequestSchema = z.object({
  database: z.string().refine(isValidPodDatabaseName),
  sql: z.string().min(1),
});

type FrameDatabaseListResponse = {
  items: LiveDatabaseEntry[];
};

const app = sandboxFrameApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.get("/", async (ctx): HandlerResult<FrameDatabaseListResponse> => {
  const auth = ctx.get("auth");
  const frame = ctx.get("frame");
  const ensureResult = await ensureFrameSandboxReady(auth, frame);
  if (ensureResult.isErr()) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to start the Frame sandbox.",
        },
      },
      ensureResult.error
    );
  }

  const result = await listDatabasesOnReadySandbox(
    auth,
    ensureResult.value.sandbox
  );
  if (result.isErr()) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to list Frame databases.",
        },
      },
      result.error
    );
  }

  return ctx.json({ items: result.value }, 200);
});

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", FrameDatabaseQueryRequestSchema),
  async (ctx): HandlerResult<QueryDatabaseResult> => {
    const auth = ctx.get("auth");
    const frame = ctx.get("frame");
    const ensureResult = await ensureFrameSandboxReady(auth, frame);
    if (ensureResult.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to start the Frame sandbox.",
          },
        },
        ensureResult.error
      );
    }

    const result = await queryDatabaseOnReadySandbox(auth, {
      sandbox: ensureResult.value.sandbox,
      ...ctx.req.valid("json"),
      resultMode: "inline_preview",
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
