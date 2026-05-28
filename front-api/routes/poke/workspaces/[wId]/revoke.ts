import { revokeAndTrackMembership } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const RevokeBodySchema = z.object({
  userId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/revoke.
const app = pokeApp();

app.post(
  "/",
  validate("json", RevokeBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { userId } = ctx.req.valid("json");

    const user = await getUserForWorkspace(auth, { userId });
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "Could not find the user.",
        },
      });
    }

    const revokeResult = await revokeAndTrackMembership(auth, user);

    if (revokeResult.isErr()) {
      switch (revokeResult.error.type) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "workspace_user_not_found",
              message: "Could not find the membership.",
            },
          });
        case "last_admin":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Cannot revoke the last admin of a workspace.",
            },
          });
        case "already_revoked":
          // Should not happen, but we ignore.
          break;
        case "invalid_end_at":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: "Can't revoke membership before it has started.",
            },
          });
        default:
          assertNever(revokeResult.error.type);
      }
    }

    return ctx.json({ success: true });
  }
);

export default app;
