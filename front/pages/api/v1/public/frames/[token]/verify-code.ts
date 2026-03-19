/** @ignoreswagger */
import { createFrameSession } from "@app/lib/api/share/frame_session";
import { validateFrameOtpChallenge } from "@app/lib/api/share/otp_challenge";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const VerifyCodeRequestBodySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
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
  if (shareScope !== "emails_only" && shareScope !== "workspace_and_emails") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This share link does not require email verification.",
      },
    });
  }

  // At this point, the user already received a code, so we can reveal grant status.
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
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: "Too many incorrect attempts. Please request a new code.",
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

  await createFrameSession(res, workspace, { email });

  return res.status(200).json({ success: true });
}

export default withLogging(handler);
