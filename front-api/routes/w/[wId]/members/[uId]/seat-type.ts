import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { syncMetronomeSeatCountForWorkspace } from "@app/lib/api/metronome/seat_sync";
import { getUserForWorkspace } from "@app/lib/api/user";
import logger from "@app/logger/logger";
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
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES),
});

const ParamsSchema = z.object({
  uId: z.string(),
});

type PatchMemberSeatTypeResponseBody = {
  seatType: MembershipSeatType;
  scheduledSeatChangeAt: string | null;
};

// Mounted at /api/w/:wId/members/:uId/seat-type.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
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

    const { uId } = ctx.req.valid("param");
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
        case "seat_limit_reached":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "The seat type has reached its maximum capacity for this workspace.",
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

    // When the user is upgrading their own seat, sync immediately so credits
    // are available right away instead of waiting for the debounced workflow.
    if (uId === auth.getNonNullableUser().sId) {
      const syncResult = await syncMetronomeSeatCountForWorkspace({
        workspace: auth.getNonNullableWorkspace(),
      });
      if (syncResult.isErr()) {
        logger.warn(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            userId: uId,
            err: syncResult.error.message,
          },
          "[SeatType] Immediate seat sync after self-upgrade failed; debounced workflow will retry"
        );
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
