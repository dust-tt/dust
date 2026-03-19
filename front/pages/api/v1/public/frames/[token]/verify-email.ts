/** @ignoreswagger */
import {
  generateFrameOtpChallenge,
  sendFrameOtpEmail,
} from "@app/lib/api/share/otp_challenge";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const VerifyEmailRequestBodySchema = z.object({
  email: z.string().email(),
});

interface VerifyEmailResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<VerifyEmailResponseBody>>
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

  const bodyResult = VerifyEmailRequestBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body.",
      },
    });
  }

  const { email: rawEmail } = bodyResult.data;
  const email = rawEmail.toLowerCase().trim();

  const result = await FileResource.fetchByShareToken(token);
  if (result.isErr()) {
    // Return 200 to prevent enumeration.
    return res.status(200).json({ success: true });
  }

  const { shareScope, shareableFileId, workspace } = result.value;

  // Only email-based scopes require OTP.
  if (shareScope !== "emails_only" && shareScope !== "workspace_and_emails") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This share link does not require email verification.",
      },
    });
  }

  // Check if grant exists. If not, return 200 to prevent enumeration but don't send email.
  const activeGrant = await FileResource.getActiveGrantForEmail(workspace, {
    email,
    shareableFileId,
  });
  if (!activeGrant) {
    logger.info(
      { email, shareToken: token },
      "Frame OTP requested for email without active grant"
    );
    return res.status(200).json({ success: true });
  }

  const otpResult = await generateFrameOtpChallenge({
    shareToken: token,
    email,
  });
  if (otpResult.isErr()) {
    return apiError(req, res, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: "Too many verification requests. Please try again later.",
      },
    });
  }

  await sendFrameOtpEmail({
    to: email,
    code: otpResult.value.code,
    sharedByName: activeGrant.grantedBy?.fullName ?? "Someone",
  });

  return res.status(200).json({ success: true });
}

export default withLogging(handler);
