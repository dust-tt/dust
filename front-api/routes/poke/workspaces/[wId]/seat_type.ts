import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import { MEMBERSHIP_SEAT_TYPES } from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const PostSeatTypeBodySchema = z.object({
  userId: z.string(),
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES),
});

// Mounted at /api/poke/workspaces/:wId/seat_type.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostSeatTypeBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const { userId, seatType } = ctx.req.valid("json");

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

    const updateRes = await updateMembershipSeatAndTrack({
      user,
      workspace: owner,
      newSeatType: seatType,
      author: auth.user()?.toJSON() ?? "no-author",
    });

    if (updateRes.isErr()) {
      switch (updateRes.error.type) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "workspace_user_not_found",
              message: "Could not find the membership.",
            },
          });
        case "free_seat_not_allowed":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Cannot assign a free seat to a member who did not start on a free seat.",
            },
          });
        case "seat_limit_reached":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Seat limit reached for this seat type.",
            },
          });
        case "metronome_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to sync seat change with Metronome.",
            },
          });
        default:
          assertNever(updateRes.error.type);
      }
    }

    return ctx.json({ success: true });
  }
);

export default app;
