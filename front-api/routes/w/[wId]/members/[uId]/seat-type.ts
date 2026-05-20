import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import {
  MEMBERSHIP_SEAT_TYPES,
  type MembershipSeatType,
} from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const UpdateMemberSeatTypeBodySchema = z.object({
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES),
});

type PatchMemberSeatTypeResponseBody = {
  seatType: MembershipSeatType;
  scheduledSeatChangeAt: string | null;
};

// Mounted at /api/w/:wId/members/:uId/seat-type.
const app = new Hono();

app.patch("/", async (ctx) => {
  const auth = ctx.get("auth");
  const isAdmin = auth.isAdmin();

  if (!isAdmin) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can modify memberships.",
      },
    });
  }

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


  const bodyValidation = UpdateMemberSeatTypeBodySchema.safeParse(
    await ctx.req.json()
  );
  if (!bodyValidation.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
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

  const { seatType } = bodyValidation.data;

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
});

export default app;
