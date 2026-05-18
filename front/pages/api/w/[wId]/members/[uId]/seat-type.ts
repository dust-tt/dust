/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { MembershipSeatType } from "@app/types/memberships";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const UpdateMemberSeatTypeBodySchema = z.object({
  seatType: z.enum(["pro", "max"]),
});

type PatchMemberSeatTypeResponseBody = {
  seatType: MembershipSeatType;
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
          case "membership_revoked":
            return apiError(req, res, {
              status_code: 409,
              api_error: {
                type: "membership_revoked",
                message: "User's membership is revoked.",
              },
            });
          default:
            assertNever(result.error.type);
        }
      }

      return res.status(200).json({ seatType: result.value.newSeatType });
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
