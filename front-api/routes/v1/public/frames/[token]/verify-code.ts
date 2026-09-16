/** @ignoreswagger */
import { serializeFrameSessionCookie } from "@app/lib/api/share/frame_session";
import { verifyFrameEmailCode } from "@app/lib/api/share/frame_verification";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { unauthedApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const TokenParamSchema = z.object({
  token: z.string().min(1),
});

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

// Mounted at /api/v1/public/frames/:token/verify-code.
const app = unauthedApp();

app.post(
  "/",
  validate("param", TokenParamSchema),
  validate("json", VerifyCodeRequestBodySchema),
  async (ctx): HandlerResult<VerifyCodeResponseBody> => {
    const { token } = ctx.req.valid("param");
    const { email: rawEmail, code } = ctx.req.valid("json");
    const result = await verifyFrameEmailCode({
      shareToken: token,
      email: rawEmail,
      code,
    });
    if (result.isErr()) {
      const error = result.error;
      switch (error) {
        case "share_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: { type: "file_not_found", message: "Share not found." },
          });
        case "no_access":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message: "You do not have access to this shared content.",
            },
          });
        case "expired":
          return apiError(ctx, {
            status_code: 410,
            api_error: {
              type: "invalid_request_error",
              message:
                "Verification code has expired. Please request a new code.",
            },
          });
        case "max_attempts":
        case "rate_limited":
          return apiError(ctx, {
            status_code: 429,
            api_error: {
              type: "rate_limit_error",
              message: "Too many attempts. Please request a new code.",
            },
          });
        case "invalid_code":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid verification code.",
            },
          });
        default:
          assertNever(error);
      }
    }

    const cookie = serializeFrameSessionCookie(result.value);
    ctx.header("Set-Cookie", cookie);

    return ctx.json({ success: true });
  }
);

export default app;
