import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { sendEmailWithTemplate } from "@app/lib/api/email";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

const PostBodySchema = t.type({
  email: t.string,
  // Optional: the path to return to after login (not used in dummy link yet)
  returnTo: t.union([t.string, t.undefined, t.null]),
});

type PostBody = t.TypeOf<typeof PostBodySchema>;

export type PostResponseBody = {
  success: boolean;
};

const MAX_EMAILS_PER_DAY = 5;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Method not supported, expected POST.",
      },
    });
  }

  const validation = PostBodySchema.decode(req.body);
  if (isLeft(validation)) {
    const pathError = reporter.formatValidationErrors(validation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { email, returnTo } = validation.right as PostBody;

  // Basic per-email rate limit to avoid abuse.
  const remaining = await rateLimiter({
    key: `auth_outage_login_link:${email}`,
    maxPerTimeframe: MAX_EMAILS_PER_DAY,
    timeframeSeconds: 24 * 60 * 60,
    logger,
  });
  if (remaining === 0) {
    return apiError(req, res, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message: `Too many requests. Try again later.`,
      },
    });
  }

  const subject = "[Dust] Your one-time login link";
  const safeReturnTo = typeof returnTo === "string" ? returnTo : "/api/login";
  // Dummy placeholder login link for now; will be replaced in a follow-up PR.
  const dummyLink = `https://dust.tt/login/magic?token=DUMMY&returnTo=${encodeURIComponent(
    safeReturnTo
  )}`;

  const body = `
    <p>Our identity provider is currently experiencing a global outage impacting Dust and other applications.</p>
    <p>As a temporary workaround, use the one-time login link below to access Dust:</p>
    <p><a href="${dummyLink}"><strong>Sign in to Dust</strong></a></p>
    <p>If you didn't request this, you can safely ignore this email.</p>
  `;

  const result = await sendEmailWithTemplate({
    to: email,
    from: { name: "Dust team", email: "support@dust.help" },
    subject,
    body,
  });

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to send email",
      },
    });
  }

  return res.status(200).json({ success: true });
}

export default withLogging(handler);

