import {
  listFrameDatabases,
  queryFrameDatabase,
} from "@app/lib/api/frames/databases";
import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { isValidPodDatabaseName } from "@app/lib/api/sandbox/db";
import type {
  LiveDatabaseEntry,
  QueryDatabaseResult,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { SandboxFrameCtx } from "@front-api/middlewares/ctx";
import { sandboxFrameApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { withFrame } from "@front-api/middlewares/with_frames";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

const FrameParamsSchema = z.object({
  frameId: z.string().refine((value) => isResourceSId("file", value)),
});

const FrameDatabaseQueryRequestSchema = z.object({
  database: z.string().refine(isValidPodDatabaseName),
  sql: z.string().min(1),
});

type FrameDatabaseListResponse = {
  items: LiveDatabaseEntry[];
};

/**
 * @cc [owner:davidebbo,label:security;product] frame-database-authorization
 * A Frame database request MUST be granted only to callers who can write the Frame's source
 * (`canWriteFrameV2Source`), with the Frame resolved inside the token's workspace, and the check
 * MUST run before the Frame sandbox is started or queried. The action-token requirement itself is
 * enforced by the parent `sandboxAuth({ allowedTokenKinds: ["action"] })` mount. Userless runs
 * (Slack bot user, triggers) are therefore denied for now: the permission helper requires a user.
 */
function requireFrameDatabaseAccess() {
  return createMiddleware<SandboxFrameCtx>(async (ctx, next) => {
    if (!(await canWriteFrameV2Source(ctx.get("auth"), ctx.get("frame")))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "You do not have access to this Frame's databases.",
        },
      });
    }

    await next();
  });
}

// Mounted at /api/v1/w/:wId/sandbox/frames/:frameId/databases.
const app = sandboxFrameApp();

app.use("*", validate("param", FrameParamsSchema));
app.use(
  "*",
  withFeatureFlag("frames_v2", {
    message: "Frames v2 is not enabled for this workspace.",
  })
);
app.use("*", withFrame());
app.use("*", requireFrameDatabaseAccess());

/**
 * @ignoreswagger
 * internal endpoint
 */
app.get("/", async (ctx): HandlerResult<FrameDatabaseListResponse> => {
  const result = await listFrameDatabases(ctx.get("auth"), ctx.get("frame"));
  if (result.isErr()) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to list Frame databases: ${result.error.message}`,
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
    const result = await queryFrameDatabase(
      ctx.get("auth"),
      ctx.get("frame"),
      ctx.req.valid("json")
    );
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
