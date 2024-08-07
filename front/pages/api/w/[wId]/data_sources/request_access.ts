<<<<<<< HEAD
import { rateLimiter } from "@dust-tt/types";
=======
>>>>>>> d54afafae ([data_source] - refactor: update RequestDataSourcesModal typing and API endpoint)
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";
<<<<<<< HEAD

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { sendEmailWithTemplate } from "@app/lib/email";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const PostRequestAccessBodySchema = t.type({
  emailMessage: t.string,
  userTo: t.string,
=======
import sanitizeHtml from "sanitize-html";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import { apiError } from "@app/logger/withlogging";

export const PostRequestAccessBodySchema = t.type({
  email: t.string,
  emailMessage: t.string,
  emailRequester: t.string,
>>>>>>> d54afafae ([data_source] - refactor: update RequestDataSourcesModal typing and API endpoint)
  dataSourceName: t.string,
});

export type PostRequestAccessBody = t.TypeOf<
  typeof PostRequestAccessBodySchema
>;

<<<<<<< HEAD
const MAX_ACCESS_REQUESTS_PER_DAY = 30;

=======
>>>>>>> d54afafae ([data_source] - refactor: update RequestDataSourcesModal typing and API endpoint)
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
) {
  const owner = auth.workspace();
  const user = auth.user();

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_auth_error",
        message: "Only the workspace users can send data sources requests.",
      },
    });
  }

  if (!user || !owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
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

<<<<<<< HEAD
  const emailRequester = user.email;
  const { emailMessage, userTo, dataSourceName } = bodyValidation.right;

  const userReceipent = await UserResource.fetchById(userTo);

  if (!userReceipent) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
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
        message: `You have reached the limit of ${MAX_ACCESS_REQUESTS_PER_DAY} access requests per day. Please try again tomorrow.`,
      },
    });
  }

  const body = `${emailRequester} has sent you a request regarding your connection ${dataSourceName}: ${emailMessage}`;

  const result = await sendEmailWithTemplate({
    to: userReceipent.email,
    from: { name: "Dust team", email: "team@dust.tt" },
    subject: `[Dust] Request Data source from ${emailRequester}`,
    body,
  });

  if (result.isErr()) {
=======
  const { email, emailMessage, emailRequester, dataSourceName } =
    bodyValidation.right;

  const html = `<p>${emailRequester} has sent you a request regarding the connection ${dataSourceName}</p>
    <p>Message:</p>
    ${emailMessage}`;

  try {
    const message = {
      to: email,
      from: {
        name: "Dust team",
        email: "team@dust.tt",
      },
      subject: `[Dust] Request Data source from ${emailRequester}`,
      html: sanitizeHtml(html),
    };
    await sendEmail(email, message);
    return res.status(200).json({ success: true, email });
  } catch (error) {
>>>>>>> d54afafae ([data_source] - refactor: update RequestDataSourcesModal typing and API endpoint)
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to send email",
      },
    });
  }
<<<<<<< HEAD
  return res.status(200).json({ success: true, emailTo: userReceipent.email });
=======
>>>>>>> d54afafae ([data_source] - refactor: update RequestDataSourcesModal typing and API endpoint)
}

export default withSessionAuthenticationForWorkspace(handler);
