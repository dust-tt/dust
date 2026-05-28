/** @ignoreswagger */

import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  type DefaultUserSpendLimit,
  type DefaultUserSpendLimitError,
  getDefaultUserSpendLimit,
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  setDefaultUserSpendLimit,
} from "@app/lib/api/workspace/default_user_spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const UpdateDefaultUserSpendLimitBodySchema = z.object({
  awuCredits: z
    .number()
    .int()
    .min(MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS)
    .max(MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS),
});

export type GetDefaultUserSpendLimitResponseBody = {
  awuCredits: number | null;
};

export type PutDefaultUserSpendLimitResponseBody = DefaultUserSpendLimit;

function mapErrorToHttp(
  req: NextApiRequest,
  res: NextApiResponse,
  error: DefaultUserSpendLimitError
): void {
  switch (error.type) {
    case "workspace_not_metronome_billed":
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message: error.message,
        },
      });
    case "not_found":
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: error.message,
        },
      });
    case "invalid_threshold":
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    case "metronome_error":
      return apiError(req, res, {
        status_code: 502,
        api_error: {
          type: "internal_server_error",
          message:
            "Failed to read or update the default spend limit in billing system.",
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
      | GetDefaultUserSpendLimitResponseBody
      | PutDefaultUserSpendLimitResponseBody
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
          "Only users that are `admins` for the current workspace can manage the default user spend limit.",
      },
    });
  }

  if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "plan_limit_error",
        message:
          "The default user spend limit is only available on Metronome-billed workspaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const result = await getDefaultUserSpendLimit(auth);
      if (result.isErr()) {
        if (result.error.type === "not_found") {
          return res.status(200).json({ awuCredits: null });
        }
        return mapErrorToHttp(req, res, result.error);
      }
      return res.status(200).json(result.value);
    }

    case "PUT": {
      const bodyValidation = UpdateDefaultUserSpendLimitBodySchema.safeParse(
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

      const auditContext = getAuditLogContext(auth, req);
      const result = await setDefaultUserSpendLimit(auth, {
        awuCredits: bodyValidation.data.awuCredits,
        auditContext,
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
