import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import {
  MEMBERSHIP_SEAT_TYPES,
  type MembershipSeatType,
} from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const UpdateMemberSeatTypeBodySchema = z.object({
  // `none` is allowed: admins can remove a member's seat (assign `none`), which
  // stops them from sending messages until a seat is reassigned.
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES),
});

type PatchMemberSeatTypeResponseBody = {
  seatType: MembershipSeatType;
  scheduledSeatChangeAt: string | null;
};

// Mounted at /api/w/:wId/members/:uId/seat-type.
const app = workspaceApp();

app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", UpdateMemberSeatTypeBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const isMetronomeBilled =
      auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled;

    if (!isMetronomeBilled) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message:
            "Seat type management is only available for workspaces on Metronome billing.",
        },
      });
    }

    const uId = ctx.req.param("uId") ?? "";
    const user = await getUserForWorkspace(auth, { userId: uId });

    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: "Could not find the user or their active membership.",
        },
      });
    }

    const { seatType } = ctx.req.valid("json");

    const result = await updateMembershipSeatAndTrack({
      user,
      workspace: auth.getNonNullableWorkspace(),
      newSeatType: seatType,
      author: auth.getNonNullableUser().toJSON(),
    });

    if (result.isErr()) {
      switch (result.error.type) {
        case "not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "workspace_user_not_found",
              message: "Could not find the user or their active membership.",
            },
          });
        case "free_seat_not_allowed":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The free seat is reserved for first-time members and cannot be assigned again.",
            },
          });
        case "metronome_error":
          return apiError(ctx, {
            status_code: 502,
            api_error: {
              type: "internal_server_error",
              message: "Failed to update seat in billing system.",
            },
          });
        default:
          assertNever(result.error.type);
      }
    }

    return ctx.json<PatchMemberSeatTypeResponseBody>({
      seatType: result.value.newSeatType,
      scheduledSeatChangeAt:
        result.value.scheduledSeatChangeAt?.toISOString() ?? null,
    });
  }
);

export default app;
