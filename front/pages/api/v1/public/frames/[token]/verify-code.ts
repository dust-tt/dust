/** @ignoreswagger */
import { createFrameSession } from "@app/lib/api/share/frame_session";
import { validateFrameOtpChallenge } from "@app/lib/api/share/frame_sharing";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const VerifyCodeRequestBodySchema = z.object({
  email: z.string().email(),
  code: z
    .string()
    .length(6, "Code must be 6 digits")
    .regex(/^\d+$/, "Code must be numeric"),
});

interface VerifyCodeResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<VerifyCodeResponseBody>>
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

  const { token } = req.query;
  if (!isString(token)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token parameter.",
      },
    });
  }

  const bodyResult = VerifyCodeRequestBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body.",
      },
    });
  }

  const { email: rawEmail, code } = bodyResult.data;
  const email = rawEmail.toLowerCase().trim();

  const result = await FileResource.fetchByShareToken(token);
  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "Share not found.",
      },
    });
  }

  const { shareScope, shareableFileId, workspace } = result.value;
  // Only email-based scopes require OTP — return 404 to prevent scope enumeration.
  if (shareScope !== "emails_only" && shareScope !== "workspace_and_emails") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "Share not found.",
      },
    });
  }

  // Validate OTP before checking grants. This prevents enumeration: an attacker calling this
  // endpoint directly (without going through verify-email) gets an OTP error, not a grant error.
  const otpResult = await validateFrameOtpChallenge({
    shareToken: token,
    email,
    submittedCode: code,
  });
  if (otpResult.isErr()) {
    const otpError = otpResult.error;
    switch (otpError) {
      case "expired":
        return apiError(req, res, {
          status_code: 410,
          api_error: {
            type: "invalid_request_error",
            message:
              "Verification code has expired. Please request a new code.",
          },
        });
      case "max_attempts":
      case "rate_limited":
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: "Too many attempts. Please request a new code.",
          },
        });
      case "invalid_code":
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid verification code.",
          },
        });
      default:
        assertNever(otpError);
    }
  }

  // OTP is valid. Now check the grant — it may have been revoked between code request and
  // submission. A valid OTP proves the user went through verify-email (which requires a grant),
  // so revealing "no access" here doesn't enable enumeration.
  const hasGrant = await FileResource.getActiveGrantForEmail(workspace, {
    email,
    shareableFileId,
  });
  if (!hasGrant) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "You do not have access to this shared content.",
      },
    });
  }

  await createFrameSession(res, workspace, { email });

  return res.status(200).json({ success: true });
}

export default withLogging(handler);
