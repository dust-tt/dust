import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import {
  getClientIpFromHeaders,
  isWorkOSIpAddress,
  validateWorkOSActionEvent,
} from "@app/lib/api/workos/webhook_helpers";
import { isBlacklistedEmailDomain } from "@app/lib/utils/blacklisted_email_domains";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import type {
  AuthenticationActionResponseData,
  ResponsePayload,
  UserRegistrationActionResponseData,
} from "@workos-inc/node";
import { Hono } from "hono";

type ActionResponseBody = {
  object: string;
  payload: ResponsePayload;
  signature: string;
};

const app = new Hono();

app.post("/", async (ctx): HandlerResult<ActionResponseBody> => {
  const actionSecret = ctx.req.param("actionSecret");
  if (!isString(actionSecret)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The actionSecret query parameter is required.",
      },
    });
  }

  if (actionSecret !== config.getWorkOSActionSecret()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The webhookSecret query parameter is invalid.",
      },
    });
  }

  // Validate the client IP address. Hono does not surface
  // `req.socket.remoteAddress`, so we rely on forwarded headers (the same
  // path the Next handler prioritized via `getClientIpFromHeaders`).
  const headers: Record<string, string | string[] | undefined> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const clientIp = getClientIpFromHeaders(headers);
  if (!isString(clientIp)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not determine client IP address",
      },
    });
  }

  if (!isWorkOSIpAddress(clientIp)) {
    logger.error({ clientIp }, "Request not from WorkOS IP range");
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Request not from WorkOS IP range",
      },
    });
  }

  const sigHeader = ctx.req.header("workos-signature");
  if (!isString(sigHeader)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The workos-signature header is required.",
      },
    });
  }

  const payload = await ctx.req.json();
  const result = await validateWorkOSActionEvent(payload, {
    signatureHeader: sigHeader,
  });
  if (result.isErr()) {
    logger.error({ error: result.error }, "Invalid WorkOS action");
    return apiError(ctx, {
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

  return ctx.json(signedResponse);
});

export default app;
