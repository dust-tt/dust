/** @ignoreswagger */
import {
  generateFrameOtpChallenge,
  sendFrameOtpEmail,
} from "@app/lib/api/share/frame_sharing";
import { FileResource } from "@app/lib/resources/file_resource";
import { auditLog } from "@app/logger/logger";
import { unauthedApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const TokenParamSchema = z.object({
  token: z.string().min(1),
});

const VerifyEmailRequestBodySchema = z.object({
  email: z.string().email(),
});

interface VerifyEmailResponseBody {
  success: boolean;
}

// Mounted at /api/v1/public/frames/:token/verify-email.
const app = unauthedApp();

app.post(
  "/",
  validate("param", TokenParamSchema),
  validate("json", VerifyEmailRequestBodySchema),
  async (ctx): HandlerResult<VerifyEmailResponseBody> => {
    const { token } = ctx.req.valid("param");
    const { email: rawEmail } = ctx.req.valid("json");
    const email = rawEmail.toLowerCase().trim();

    const result = await FileResource.fetchByShareToken(token);
    if (result.isErr()) {
      // Return 200 to prevent enumeration.
      return ctx.json({ success: true });
    }

    const { shareScope, shareableFileId, workspace } = result.value;

    // Only email-based scopes require OTP — return 200 to prevent scope enumeration.
    if (shareScope !== "emails_only" && shareScope !== "workspace_and_emails") {
      return ctx.json({ success: true });
    }

    // Check if grant exists. If not, return 200 to prevent enumeration but don't send email.
    const activeGrant = await FileResource.getActiveGrantForEmail(workspace, {
      email,
      shareableFileId,
    });
    if (!activeGrant) {
      auditLog(
        { author: "no-author", email, shareToken: token },
        "Frame OTP requested for email without active grant"
      );
      return ctx.json({ success: true });
    }

    const otpResult = await generateFrameOtpChallenge({
      shareToken: token,
      email,
    });
    if (otpResult.isErr()) {
      return apiError(ctx, {
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

    return ctx.json({ success: true });
  }
);

export default app;
