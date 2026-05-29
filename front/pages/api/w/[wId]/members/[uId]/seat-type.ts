// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import {
  MEMBERSHIP_SEAT_TYPES,
  type MembershipSeatType,
} from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const UpdateMemberSeatTypeBodySchema = z.object({
  // `none` is allowed: admins can remove a member's seat (assign `none`), which
  // stops them from sending messages until a seat is reassigned.
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES),
});

type PatchMemberSeatTypeResponseBody = {
  seatType: MembershipSeatType;
  scheduledSeatChangeAt: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchMemberSeatTypeResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can modify memberships.",
      },
    });
  }

  if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "plan_limit_error",
        message:
          "Seat type management is only available for workspaces on Metronome billing.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const { uId } = req.query;
      if (!isString(uId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters, `uId` (string) is required.",
          },
        });
      }

      const bodyValidation = UpdateMemberSeatTypeBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const user = await getUserForWorkspace(auth, { userId: uId });
      if (!user) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_user_not_found",
            message: "Could not find the user or their active membership.",
          },
        });
      }

      const result = await updateMembershipSeatAndTrack({
        user,
        workspace: auth.getNonNullableWorkspace(),
        newSeatType: bodyValidation.data.seatType,
        author: auth.getNonNullableUser().toJSON(),
      });

      if (result.isErr()) {
        switch (result.error.type) {
          case "not_found":
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "workspace_user_not_found",
                message: "Could not find the user or their active membership.",
              },
            });
          case "free_seat_not_allowed":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message:
                  "The free seat is reserved for first-time members and cannot be assigned again.",
              },
            });
          case "metronome_error":
            return apiError(req, res, {
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

      return res.status(200).json({
        seatType: result.value.newSeatType,
        scheduledSeatChangeAt:
          result.value.scheduledSeatChangeAt?.toISOString() ?? null,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
