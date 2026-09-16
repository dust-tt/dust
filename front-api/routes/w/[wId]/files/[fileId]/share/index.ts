import { checkFrameShareScopePermission } from "@app/lib/api/share/frame_sharing";
import { ensureAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import {
  buildShareFileResponse,
  type ShareFrameViewerFile,
} from "@app/lib/api/viz/share_frame_viewer_files";
import type { ShareFileResponseBody } from "@app/lib/resources/file_resource";
import {
  fileShareScopeSchema,
  isUnverifiableFrameFileRefsShareError,
} from "@app/types/files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withShareableFrame } from "@front-api/middlewares/with_shareable_frame";
import { z } from "zod";

import grants from "./grants";

export type { ShareFrameViewerFile };

const ShareFileRequestBodySchema = z.object({
  shareScope: fileShareScopeSchema,
});

const ParamsSchema = z.object({
  fileId: z.string(),
});

// Mounted at /api/w/:wId/files/:fileId/share.
const app = workspaceApp();

// Register `/grants` BEFORE the bare `/` handlers — see [directory-route-mounts] for ordering
// rules around literal vs. param siblings (though they are different routes,
// keeping mounts before leaf handlers matches the convention used elsewhere).
app.route("/grants", grants);

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  withShareableFrame,
  async (ctx): HandlerResult<ShareFileResponseBody> => {
    const auth = ctx.get("auth");
    const file = ctx.get("frame");

    const shareResponse = await buildShareFileResponse(auth, file);
    if (!shareResponse) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    return ctx.json(shareResponse);
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", ShareFileRequestBodySchema),
  withShareableFrame,
  async (ctx): HandlerResult<ShareFileResponseBody> => {
    const auth = ctx.get("auth");
    const file = ctx.get("frame");

    const { shareScope } = ctx.req.valid("json");

    const permission = await checkFrameShareScopePermission(
      auth,
      shareScope,
      file
    );
    if (permission.isErr()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: permission.error.message,
        },
      });
    }

    await file.setShareScope(auth, shareScope);

    const allowlistResult = await ensureAuthorizedFileAccessForShare(
      auth,
      file
    );
    if (allowlistResult.isErr()) {
      const allowlistError = allowlistResult.error;
      return apiError(ctx, {
        status_code:
          allowlistError.code === "invalid_request_error" ? 400 : 500,
        api_error: {
          type:
            allowlistError.code === "invalid_request_error"
              ? "invalid_request_error"
              : "internal_server_error",
          message: allowlistError.message,
          ...(isUnverifiableFrameFileRefsShareError(allowlistError)
            ? { unverifiableRefs: allowlistError.unverifiableRefs }
            : {}),
        },
      });
    }

    const shareResponse = await buildShareFileResponse(auth, file);
    if (!shareResponse) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    return ctx.json(shareResponse);
  }
);

export default app;
