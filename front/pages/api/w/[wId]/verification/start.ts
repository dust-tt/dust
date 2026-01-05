import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { startVerification } from "@app/lib/api/workspace_verification";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";
import type {
  StartVerificationResponse,
  VerificationErrorResponse,
  VerificationErrorType,
} from "@app/types/workspace_verification";

function getStatusCodeForError(type: VerificationErrorType): number {
  switch (type) {
    case "rate_limit_error":
      return 429;
    case "invalid_request_error":
    case "verification_error":
      return 400;
    case "phone_already_used_error":
      return 403;
    default:
      assertNever(type);
  }
}

const E164PhoneNumber = t.refinement(
  t.string,
  (s) => /^\+[1-9]\d{1,14}$/.test(s),
  "E164PhoneNumber"
);

const PostStartVerificationRequestBody = t.type({
  phoneNumber: E164PhoneNumber,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<StartVerificationResponse | VerificationErrorResponse>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can start verification.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostStartVerificationRequestBody.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { phoneNumber } = bodyValidation.right;

      const result = await startVerification(auth, phoneNumber);

      if (result.isErr()) {
        const error = result.error;
        return res.status(getStatusCodeForError(error.type)).json({
          error: {
            type: error.type,
            message: error.message,
            ...(error.retryAfterSeconds !== undefined && {
              retryAfter: error.retryAfterSeconds,
            }),
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: "Verification code sent successfully.",
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
