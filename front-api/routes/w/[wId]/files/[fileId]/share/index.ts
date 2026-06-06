import { ensureAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { APIErrorResponse } from "@app/types/error";
import type { FileShareScope } from "@app/types/files";
import {
  fileShareScopeSchema,
  isConversationFileUseCase,
  isInteractiveContentType,
  isUnverifiableFrameFileRefsShareError,
} from "@app/types/files";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context, TypedResponse } from "hono";
import { z } from "zod";

export type ShareFileResponseBody = {
  scope: FileShareScope;
  sharedAt: number;
  shareUrl: string;
};

import grants from "./grants";

const ShareFileRequestBodySchema = z.object({
  shareScope: fileShareScopeSchema,
});

const ParamsSchema = z.object({
  fileId: z.string(),
});

// Mounted at /api/w/:wId/files/:fileId/share.
const app = workspaceApp();

// Register `/grants` BEFORE the bare `/` handlers — see [API2] for ordering
// rules around literal vs. param siblings (though they are different routes,
// keeping mounts before leaf handlers matches the convention used elsewhere).
app.route("/grants", grants);

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<ShareFileResponseBody> => {
    const auth = ctx.get("auth");
    const { fileId } = ctx.req.valid("param");

    const file = await fetchShareableFile(ctx, auth, fileId);
    if (file instanceof Response) {
      return file;
    }

    const shareInfo = await file.getShareInfo();
    if (!shareInfo) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    return ctx.json(shareInfo);
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", ShareFileRequestBodySchema),
  async (ctx): HandlerResult<ShareFileResponseBody> => {
    const auth = ctx.get("auth");
    const { fileId } = ctx.req.valid("param");

    const file = await fetchShareableFile(ctx, auth, fileId);
    if (file instanceof Response) {
      return file;
    }

    const { shareScope } = ctx.req.valid("json");

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

    const shareInfo = await file.getShareInfo();
    if (!shareInfo) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }

    return ctx.json(shareInfo);
  }
);

// Returns the file when it exists, is interactive, and (if linked to a
// conversation) the caller can access it. Otherwise returns a `Response` for
// the handler to short-circuit on.
async function fetchShareableFile(
  ctx: Context,
  auth: Authenticator,
  fileId: string
): Promise<FileResource | (Response & TypedResponse<APIErrorResponse>)> {
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  }

  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be shared publicly.",
      },
    });
  }

  return file;
}

export default app;
