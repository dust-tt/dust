/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  UpdateMemberSeatTypeInputSchema,
  updateMemberSeatType,
} from "@app/lib/api/membership";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { MembershipSeatType } from "@app/types/memberships";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

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
      const { userId } = req.query;
      if (!isString(userId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters, `userId` (string) is required.",
          },
        });
      }

      const bodyValidation = UpdateMemberSeatTypeInputSchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const result = await updateMemberSeatType(auth, {
        userId,
        seatType: bodyValidation.data.seatType,
      });

      if (result.isErr()) {
        const statusCode =
          result.error.type === "membership_revoked" ? 409 : 404;
        return apiError(req, res, {
          status_code: statusCode,
          api_error: {
            type: result.error.type,
            message: result.error.message,
          },
        });
      }

      return res.status(200).json(result.value);
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
