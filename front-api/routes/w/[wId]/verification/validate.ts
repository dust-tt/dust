import { validateVerification } from "@app/lib/api/workspace_verification";
import type {
  VerificationErrorResponse,
  VerifyCodeResponse,
} from "@app/types/workspace_verification";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import { E164PhoneNumber, getStatusCodeForError, OtpCode } from "./start";

const PostValidateVerificationRequestBody = z.object({
  phoneNumber: E164PhoneNumber,
  code: OtpCode,
});

// Mounted at /api/w/:wId/verification/validate.
const app = workspaceApp();

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostValidateVerificationRequestBody),
  async (
    ctx
  ): HandlerResult<VerifyCodeResponse | VerificationErrorResponse> => {
    const auth = ctx.get("auth");

    const { phoneNumber, code } = ctx.req.valid("json");

    const result = await validateVerification(auth, phoneNumber, code);

    if (result.isErr()) {
      const error = result.error;
      return ctx.json(
        {
          error: {
            type: error.type,
            message: error.message,
          },
        },
        getStatusCodeForError(error.type)
      );
    }

    return ctx.json({
      success: true as const,
      verified: true as const,
    });
  }
);

export default app;
