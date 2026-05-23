/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { startVerification } from "@app/lib/api/workspace_verification";
import { verifyTurnstileToken } from "@app/lib/api/workspace_verification/turnstile";
import type { Authenticator } from "@app/lib/auth";
import { PHONE_REGEXP } from "@app/lib/resources/workspace_verification_attempt_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  StartVerificationResponse,
  VerificationErrorResponse,
  VerificationErrorType,
} from "@app/types/workspace_verification";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const E164PhoneNumber = z
  .string()
  .regex(PHONE_REGEXP, { message: "E164PhoneNumber" });

export const OtpCode = z.string().regex(/^\d{6}$/, { message: "OtpCode" });

export function getStatusCodeForError(type: VerificationErrorType): number {
  switch (type) {
    case "rate_limit_error":
      return 429;
    case "invalid_request_error":
    case "verification_error":
    case "invalid_captcha":
      return 400;
    case "phone_already_used_error":
      return 403;
    default:
      assertNever(type);
  }
}

const PostStartVerificationRequestBody = z.object({
  phoneNumber: E164PhoneNumber,
  captchaToken: z.string().min(1),
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
      const bodyValidation = PostStartVerificationRequestBody.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { phoneNumber, captchaToken } = bodyValidation.data;

      const captchaResult = await verifyTurnstileToken({
        token: captchaToken,
        remoteIp: auth.clientIp(),
      });
      if (captchaResult.isErr()) {
        return res.status(getStatusCodeForError("invalid_captcha")).json({
          error: {
            type: "invalid_captcha",
            message: "Captcha verification failed. Please try again.",
          },
        });
      }

      const result = await startVerification(auth, phoneNumber);

      if (result.isErr()) {
        const error = result.error;
        return res.status(getStatusCodeForError(error.type)).json({
          error: {
            type: error.type,
            message: error.message,
            ...(error.retryAfterSeconds !== undefined && {
              retryAfterSeconds: error.retryAfterSeconds,
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
