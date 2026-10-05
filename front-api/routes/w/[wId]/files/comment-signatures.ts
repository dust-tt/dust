import {
  getDfmCommentPublicKey,
  signDfmCommentMessage,
} from "@app/lib/api/files/dfm_comment_signatures";
import type {
  GetDfmCommentSigningKeyResponseBody,
  PostDfmCommentSignatureResponseBody,
} from "@app/types/api/file_system/types";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// Mounted at /api/w/:wId/files/comment-signatures.
const app = workspaceApp();

const PostBodySchema = z.object({
  commentId: z.string().min(1),
  body: z.string().min(1),
});

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetDfmCommentSigningKeyResponseBody> =>
    ctx.json({ publicKey: getDfmCommentPublicKey() })
);

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostBodySchema),
  async (ctx): HandlerResult<PostDfmCommentSignatureResponseBody> => {
    const signed = await signDfmCommentMessage(
      ctx.get("auth"),
      ctx.req.valid("json")
    );
    if (signed.isErr()) {
      return apiError(
        ctx,
        signed.error.code === "not_available"
          ? {
              status_code: 403,
              api_error: {
                type: "feature_flag_not_found",
                message: signed.error.message,
              },
            }
          : {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: signed.error.message,
              },
            }
      );
    }
    return ctx.json({ message: signed.value });
  }
);

export default app;
