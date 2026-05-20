/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  type GetUserSpendLimitResponse,
  getUserSpendLimit,
  MAX_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_USER_SPEND_LIMIT_AWU_CREDITS,
  type SetUserSpendLimitResponse,
  setUserSpendLimit,
  type UserSpendLimitError,
} from "@app/lib/api/users/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const UpdateUserSpendLimitBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }),
  z.object({
    kind: z.literal("limited"),
    awuCredits: z
      .number()
      .int()
      .min(MIN_USER_SPEND_LIMIT_AWU_CREDITS)
      .max(MAX_USER_SPEND_LIMIT_AWU_CREDITS),
  }),
]);

export type GetUserSpendLimitResponseBody = GetUserSpendLimitResponse;

export type PutUserSpendLimitResponseBody = SetUserSpendLimitResponse;

function mapErrorToHttp(
  req: NextApiRequest,
  res: NextApiResponse,
  error: UserSpendLimitError
): void {
  switch (error.type) {
    case "user_not_found":
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: error.message,
        },
      });
    case "workspace_not_metronome_billed":
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message: error.message,
        },
      });
    case "metronome_error":
      return apiError(req, res, {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message: "Failed to update spend limit in billing system.",
        },
      });
    default:
      assertNever(error.type);
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetUserSpendLimitResponseBody | PutUserSpendLimitResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can manage member spend limits.",
      },
    });
  }

  if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "plan_limit_error",
        message:
          "Per-user spend limits are only available on Metronome-billed workspaces.",
      },
    });
  }

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

  switch (req.method) {
    case "GET": {
      const result = await getUserSpendLimit(auth, { userId: uId });
      if (result.isErr()) {
        return mapErrorToHttp(req, res, result.error);
      }
      return res.status(200).json(result.value);
    }

    case "PUT": {
      const bodyValidation = UpdateUserSpendLimitBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const result = await setUserSpendLimit(auth, {
        userId: uId,
        limit: bodyValidation.data,
      });
      if (result.isErr()) {
        return mapErrorToHttp(req, res, result.error);
      }
      return res.status(200).json(result.value);
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PUT is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
