import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const PostRequestAccessBodySchema = t.type({
  emailMessage: t.string,
  emailRequester: t.string,
  dataSourceName: t.string,
});

export type PostRequestAccessBody = t.TypeOf<
  typeof PostRequestAccessBodySchema
>;

async function sendEmailWithTemplate(
  to: string,
  from: { name: string; email: string },
  subject: string,
  body: string
): Promise<Result<void, Error>> {
  const templateId = config.getGenericEmailTemplate();
  const message = {
    to,
    from,
    templateId,
    dynamic_template_data: {
      subject,
      body,
    },
  };

  try {
    await sendEmail(to, message);
    logger.info({ email: to, subject }, "Sending email");
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        error: e,
        to,
        subject,
      },
      "Error sending email."
    );
    return new Err(e as Error);
  }
}

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

  const email = user.email;
  const { emailMessage, emailRequester, dataSourceName } = bodyValidation.right;

  const body = `${emailRequester} has sent you a request regarding your connection ${dataSourceName}:g ${emailMessage}`;

  const result = await sendEmailWithTemplate(
    email,
    { name: "Dust team", email: "team@dust.tt" },
    `[Dust] Request Data source from ${emailRequester}`,
    body
  );

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to send email",
      },
    });
  }
  return res.status(200).json({ success: true, email });
}

export default withSessionAuthenticationForWorkspace(handler);
