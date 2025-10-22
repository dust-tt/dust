import { isLeft } from "fp-ts/lib/Either";
import { escape } from "html-escaper";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const PostRequestActionsAccessBodySchema = t.type({
  emailMessage: t.string,
  mcpServerViewId: t.string,
});

export type PostRequestActionsAccessBody = t.TypeOf<
  typeof PostRequestActionsAccessBodySchema
>;

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
        type: "mcp_auth_error",
        message: "You are not authorized to submit actions requests.",
      },
    });
  }
  const { method } = req;

  if (method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected",
      },
    });
  }

  const bodyValidation = PostRequestActionsAccessBodySchema.decode(req.body);
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
  const { emailMessage, mcpServerViewId } = bodyValidation.right;

  const mcpServerView = await MCPServerViewResource.fetchById(
    auth,
    mcpServerViewId
  );

  if (!mcpServerView) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_view_not_found",
        message: "The MCP server view was not found",
      },
    });
  }

  if (!mcpServerView.editedByUser?.sId) {
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
          `You have reached the limit of ${MAX_ACCESS_REQUESTS_PER_DAY} access requests ` +
          "per day. Please try again tomorrow.",
      },
    });
  }

  const body =
    `${emailRequester} has sent you a request regarding access to ` +
    `tools ${getMcpServerViewDisplayName(mcpServerView.toJSON())}: ` +
    escape(emailMessage);

  const result = await sendEmailWithTemplate({
    to: mcpServerView.editedByUser.email,
    from: { name: "Dust team", email: "support@dust.help" },
    replyTo: emailRequester,
    subject: `[Dust] Tools request from ${emailRequester}`,
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
