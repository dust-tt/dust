import { listFrameDatabases } from "@app/lib/api/frames/databases";
import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import type { LiveDatabaseEntry } from "@app/lib/api/sandbox_functions/dsbx_db";
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

import databaseById from "./[database]";

const FrameParamsSchema = z.object({
  frameId: z.string().refine((value) => isResourceSId("file", value)),
});

type FrameDatabaseListResponse = {
  items: LiveDatabaseEntry[];
};

/**
 * @cc [owner:davidebbo,label:security;product] frame-database-authorization
 * A Frame database request (this listing and every route under `/:database`) MUST be granted only to callers who can write the Frame's source
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

// Mounted at /api/v1/w/:wId/sandbox/frames/:frameId/databases. The auth chain below is
// directory-scoped: it also guards the /:database sub-routes.
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

app.route("/:database", databaseById);

export default app;
