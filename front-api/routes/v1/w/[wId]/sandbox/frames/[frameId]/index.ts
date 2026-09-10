import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { isSandboxExecTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { hasFeatureFlag } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { SandboxFrameCtx } from "@front-api/middlewares/ctx";
import { sandboxFrameApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

import databases from "./databases";

const FrameParamsSchema = z.object({
  frameId: z.string().refine((value) => isResourceSId("file", value)),
});

/**
 * @cc [owner:davidebbo,label:security;product] frame-database-authorization
 * Frame database requests MUST use a conversation action token, resolve the target Frame inside
 * that token's authenticated workspace, and require write access to the Frame's source before
 * starting or querying its sandbox.
 */
function authorizeFrameDatabaseAccess() {
  return createMiddleware<SandboxFrameCtx>(async (ctx, next) => {
    const auth = ctx.get("auth");
    const claims = ctx.get("sandboxClaims");
    if (!isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot access Frame databases.",
        },
      });
    }
    if (!(await hasFeatureFlag(auth, "frames_v2"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "Frames v2 is not enabled for this workspace.",
        },
      });
    }

    const frameId = ctx.req.param("frameId");
    const frame = frameId ? await FileResource.fetchById(auth, frameId) : null;
    if (!frame?.isFrameV2) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "Frame not found.",
        },
      });
    }
    if (!(await canWriteFrameV2Source(auth, frame))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "You do not have access to this Frame's databases.",
        },
      });
    }

    ctx.set("frame", frame);
    await next();
  });
}

// Mounted at /api/v1/w/:wId/sandbox/frames/:frameId.
const app = sandboxFrameApp();

app.use("*", validate("param", FrameParamsSchema));
app.use("*", authorizeFrameDatabaseAccess());

app.route("/databases", databases);

export default app;
