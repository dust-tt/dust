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
  filePath: z.string().min(1),
  commentId: z.string().min(1),
  position: z.number().int().min(0),
  previous: z
    .object({
      author: z.object({
        kind: z.enum(["user", "agent"]),
        id: z.string(),
        name: z.string(),
      }),
      createdAt: z.string(),
      body: z.string(),
    })
    .nullable(),
  body: z.string().min(1),
});

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetDfmCommentSigningKeyResponseBody> =>
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
      switch (signed.error.code) {
        case "not_available":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "feature_flag_not_found",
              message: signed.error.message,
            },
          });
        case "unavailable_file":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "file_not_found",
              message: signed.error.message,
            },
          });
        default:
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: signed.error.message,
            },
          });
      }
    }
    return ctx.json({ message: signed.value });
  }
);

export default app;
