/** @ignoreswagger */
import config from "@app/lib/api/config";
import { FRAME_SESSION_COOKIE_NAME } from "@app/lib/api/share/frame_session";
import { validateFrameOtpChallenge } from "@app/lib/api/share/frame_sharing";
import { FileResource } from "@app/lib/resources/file_resource";
import { ExternalViewerSessionModel } from "@app/lib/resources/storage/models/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isDevelopment, isTest } from "@app/types/shared/env";
import { unauthedApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import crypto from "crypto";
import type { Context } from "hono";
import { z } from "zod";

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days.

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

/**
 * Create an external viewer session for a verified email and set the session
 * cookie on the Hono response. Mirrors `createFrameSession` from
 * `front/lib/api/share/frame_session.ts` but uses `ctx.header` instead of
 * Next's `res.setHeader`.
 */
async function setFrameSessionCookie(
  ctx: Context,
  workspace: { id: number },
  { email }: { email: string }
): Promise<void> {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  await ExternalViewerSessionModel.create({
    email,
    expiresAt,
    sessionToken,
    workspaceId: workspace.id,
  });

  const isLocal = isDevelopment() || isTest();
  const domain = isLocal ? undefined : config.getWorkOSSessionCookieDomain();
  const secureFlag = isLocal ? "" : "; Secure";
  const cookieValue = `${FRAME_SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}`;

  if (domain) {
    ctx.header("Set-Cookie", `${cookieValue}; Domain=${domain}`);
  } else {
    ctx.header("Set-Cookie", cookieValue);
  }
}

// Mounted at /api/v1/public/frames/:token/verify-code.
const app = unauthedApp();

app.post(
  "/",
  validate("json", VerifyCodeRequestBodySchema),
  async (ctx): HandlerResult<VerifyCodeResponseBody> => {
    const token = ctx.req.param("token");
    if (!token) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing token parameter.",
        },
      });
    }

    const { email: rawEmail, code } = ctx.req.valid("json");
    const email = rawEmail.toLowerCase().trim();

    const result = await FileResource.fetchByShareToken(token);
    if (result.isErr()) {
      return apiError(ctx, {
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
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "You do not have access to this shared content.",
        },
      });
    }

    await setFrameSessionCookie(ctx, workspace, { email });

    return ctx.json({ success: true });
  }
);

export default app;
