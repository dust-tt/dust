/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { PostRequestFeatureAccessBodySchema } from "@app/lib/api/labs";
import type { Authenticator } from "@app/lib/auth";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { escape } from "html-escaper";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

const MAX_ACCESS_REQUESTS_PER_DAY = 30;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
) {
  const user = auth.getNonNullableUser();

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to submit connections requests.",
      },
    });
  }

  const { method } = req;

  if (method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = PostRequestFeatureAccessBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    const pathError = fromError(bodyValidation.error).toString();

    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const emailRequester = user.email;
  const { emailMessage, featureName } = bodyValidation.data;

  const rateLimitKey = `labs_access_requests:${auth.getNonNullableWorkspace().sId}`;
  const remaining = await rateLimiter({
    key: rateLimitKey,
    maxPerTimeframe: MAX_ACCESS_REQUESTS_PER_DAY,
    timeframeSeconds: 24 * 60 * 60, // 1 day
    logger,
  });

  if (remaining === 0) {
    return apiError(req, res, {
      status_code: 429,
      api_error: {
        type: "rate_limit_error",
        message:
          `You have reached the limit of ${MAX_ACCESS_REQUESTS_PER_DAY} access ` +
          "requests per day. Please try again tomorrow.",
      },
    });
  }

  const body =
    `${emailRequester} requests access to the ${escape(featureName)} labs feature for ` +
    `workspace <em>${auth.getNonNullableWorkspace().sId}</em>:
  <br />
  <br />
  ${escape(emailMessage)}`;

  const result = await sendEmailWithTemplate({
    to: "support@dust.tt",
    from: config.getSupportEmailAddress(),
    subject: `[Dust] Labs Feature Request: ${featureName} from ${emailRequester}`,
    replyTo: emailRequester,
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

export default withSessionAuthenticationForWorkspace(handler);
