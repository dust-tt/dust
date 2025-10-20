import { isLeft } from "fp-ts/Either";
import { escape } from "html-escaper";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const PostRequestAccessBodySchema = t.type({
  emailMessage: t.string,
  dataSourceId: t.string,
});

export type PostRequestAccessBody = t.TypeOf<
  typeof PostRequestAccessBodySchema
>;

const MAX_ACCESS_REQUESTS_PER_DAY = 30;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
) {
  const user = auth.getNonNullableUser();

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

  const bodyValidation = PostRequestAccessBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);

    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const emailRequester = user.email;
  const { emailMessage, dataSourceId } = bodyValidation.right;

  const dataSource = await DataSourceResource.fetchById(auth, dataSourceId, {
    includeEditedBy: true,
  });
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source was not found.",
      },
    });
  }

  if (!dataSource.editedByUser?.sId) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "user_not_found",
        message: "No admin user found for this data source",
      },
    });
  }

  const rateLimitKey = `access_requests:${user.sId}`;
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
    `${emailRequester} has sent you a request regarding access to connection ` +
    `${escape(dataSource.name)}: ${escape(emailMessage)}`;

  const result = await sendEmailWithTemplate({
    to: dataSource.editedByUser.email,
    from: { name: "Dust team", email: "support@dust.help" },
    replyTo: emailRequester,
    subject: `[Dust] Request Data source from ${emailRequester}`,
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
