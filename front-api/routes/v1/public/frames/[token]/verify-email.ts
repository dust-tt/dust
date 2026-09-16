/** @ignoreswagger */
import { requestFrameEmailVerification } from "@app/lib/api/share/frame_verification";
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
    const result = await requestFrameEmailVerification({
      shareToken: token,
      email: rawEmail,
    });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 429,
        api_error: {
          type: "rate_limit_error",
          message: "Too many verification requests. Please try again later.",
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
