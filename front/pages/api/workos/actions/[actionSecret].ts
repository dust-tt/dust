import type {
  AuthenticationActionResponseData,
  ResponsePayload,
  UserRegistrationActionResponseData,
} from "@workos-inc/node";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import {
  getClientIpFromHeaders,
  isWorkOSIpAddress,
  validateWorkOSActionEvent,
} from "@app/lib/api/workos/webhook_helpers";
import { isBlacklistedEmailDomain } from "@app/lib/utils/blacklisted_email_domains";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{
      object: string;
      payload: ResponsePayload;
      signature: string;
    }>
  >
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  // Validate the webhook secret.
  const { actionSecret } = req.query;
  if (!isString(actionSecret)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The actionSecret query parameter is required.",
      },
    });
  }

  if (actionSecret !== config.getWorkOSActionSecret()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The webhookSecret query parameter is invalid.",
      },
    });
  }

  // Validate the client IP address.
  const clientIp =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    getClientIpFromHeaders(req.headers) || req.socket.remoteAddress;
  if (!isString(clientIp)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not determine client IP address",
      },
    });
  }

  const isWorkOSIp = isWorkOSIpAddress(clientIp);
  if (!isWorkOSIp) {
    logger.error(
      {
        clientIp,
      },
      "Request not from WorkOS IP range"
    );

    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Request not from WorkOS IP range",
      },
    });
  }

  const { body: payload } = req;
  const sigHeader = req.headers["workos-signature"];
  if (!isString(sigHeader)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The workos-signature header is required.",
      },
    });
  }

  const result = await validateWorkOSActionEvent(payload, {
    signatureHeader: sigHeader,
  });
  if (result.isErr()) {
    logger.error(
      {
        error: result.error,
      },
      "Invalid WorkOS action"
    );

    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  const action = result.value;

  const workOS = getWorkOS();

  let responsePayload:
    | UserRegistrationActionResponseData
    | AuthenticationActionResponseData;

  if (action.object === "user_registration_action_context") {
    // Determine whether to allow or deny the action.
    if (isBlacklistedEmailDomain(action.userData.email.split("@")[1])) {
      responsePayload = {
        type: "user_registration" as const,
        verdict: "Deny" as const,
        errorMessage: "This mail domain is not allowed",
      };
    } else {
      responsePayload = {
        type: "user_registration" as const,
        verdict: "Allow" as const,
      };
    }
  } else {
    // Always allow authentication actions.
    responsePayload = {
      type: "authentication" as const,
      verdict: "Allow" as const,
    };
  }

  const signedResponse = await workOS.actions.signResponse(
    responsePayload,
    config.getWorkOSActionSigningSecret()
  );
  res.json(signedResponse);
}

export default withLogging(handler);
