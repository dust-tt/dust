import { startVerification } from "@app/lib/api/workspace_verification";
import { verifyTurnstileToken } from "@app/lib/api/workspace_verification/turnstile";
import { PHONE_REGEXP } from "@app/lib/resources/workspace_verification_attempt_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  StartVerificationResponse,
  VerificationErrorResponse,
  VerificationErrorType,
} from "@app/types/workspace_verification";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

export const E164PhoneNumber = z
  .string()
  .regex(PHONE_REGEXP, { message: "E164PhoneNumber" });

export const OtpCode = z.string().regex(/^\d{6}$/, { message: "OtpCode" });

export function getStatusCodeForError(
  type: VerificationErrorType
): ContentfulStatusCode {
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

// Mounted at /api/w/:wId/verification/start.
const app = workspaceApp();

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostStartVerificationRequestBody),
  async (
    ctx
  ): HandlerResult<StartVerificationResponse | VerificationErrorResponse> => {
    const auth = ctx.get("auth");

    const { phoneNumber, captchaToken } = ctx.req.valid("json");

    const captchaResult = await verifyTurnstileToken({
      token: captchaToken,
      remoteIp: auth.clientIp(),
    });
    if (captchaResult.isErr()) {
      return ctx.json(
        {
          error: {
            type: "invalid_captcha" as const,
            message: "Captcha verification failed. Please try again.",
          },
        },
        getStatusCodeForError("invalid_captcha")
      );
    }

    const result = await startVerification(auth, phoneNumber);

    if (result.isErr()) {
      const error = result.error;
      return ctx.json(
        {
          error: {
            type: error.type,
            message: error.message,
            ...(error.retryAfterSeconds !== undefined && {
              retryAfterSeconds: error.retryAfterSeconds,
            }),
          },
        },
        getStatusCodeForError(error.type)
      );
    }

    return ctx.json({
      success: true as const,
      message: "Verification code sent successfully.",
    });
  }
);

export default app;
