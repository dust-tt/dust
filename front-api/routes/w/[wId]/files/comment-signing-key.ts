import { getDfmCommentPublicKey } from "@app/lib/api/files/dfm_comment_signatures";
import type { GetDfmCommentSigningKeyResponseBody } from "@app/types/api/file_system/types";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/files/comment-signing-key.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetDfmCommentSigningKeyResponseBody> =>
    ctx.json({ publicKey: getDfmCommentPublicKey() })
);

export default app;
