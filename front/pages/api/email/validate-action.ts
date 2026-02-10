import type { NextApiRequest, NextApiResponse } from "next";

import {
  getActionContextForEmailValidation,
  validateActionFromEmail,
} from "@app/lib/api/assistant/conversation/validate_action_from_email";
import config from "@app/lib/api/config";
import { verifyValidationToken } from "@app/lib/api/email/validation_token";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type ValidateActionResponse = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateActionResponse>>
): Promise<void> {
  // GET: Redirect to confirmation landing page (no side effects).
  // POST: Perform the actual validation.
  if (req.method === "GET") {
    return handleGetRequest(req, res);
  }

  if (req.method === "POST") {
    return handlePostRequest(req, res);
  }

  return apiError(req, res, {
    status_code: 405,
    api_error: {
      type: "method_not_supported_error",
      message: "Only GET and POST requests are supported.",
    },
  });
}

/**
 * GET handler: Verifies the token and redirects to the confirmation landing page.
 * This prevents link prefetchers from triggering the actual validation.
 */
async function handleGetRequest(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateActionResponse>>
): Promise<void> {
  const { token } = req.query;
  if (!isString(token)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid token parameter.",
      },
    });
  }

  // Redirect to the confirmation landing page.
  // The landing page will verify the token and show a confirmation button.
  res.redirect(
    302,
    `${config.getAppUrl()}/email/validation-confirm?token=${encodeURIComponent(token)}`
  );
}

/**
 * POST handler: Performs the actual validation after user confirmation.
 */
async function handlePostRequest(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateActionResponse>>
): Promise<void> {
  const { token } = req.body;
  if (!isString(token)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid token parameter.",
      },
    });
  }

  // Verify the signed token.
  const tokenResult = verifyValidationToken(token);
  if (tokenResult.isErr()) {
    const error = tokenResult.error;
    logger.warn({ tokenError: error.type }, "[email] Invalid validation token");

    const errorMessage =
      error.type === "expired"
        ? "expired"
        : error.type === "invalid_signature"
          ? "invalid"
          : "error";

    // Redirect to confirmation page with error status.
    res.redirect(
      302,
      `${config.getAppUrl()}/email/validation-confirmed?status=${errorMessage}`
    );
    return;
  }

  const { actionId, approvalState } = tokenResult.value;

  // Get action context to build authenticator.
  const contextResult = await getActionContextForEmailValidation(actionId);
  if (contextResult.isErr()) {
    logger.error(
      { actionId, error: contextResult.error.message },
      "[email] Failed to get action context for email validation"
    );
    res.redirect(
      302,
      `${config.getAppUrl()}/email/validation-confirmed?status=error`
    );
    return;
  }

  const { workspaceSId, conversationSId, userSId } = contextResult.value;

  // Build authenticator for the user who triggered the email.
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    userSId,
    workspaceSId
  );
  if (!auth) {
    logger.error(
      { userSId, workspaceSId },
      "[email] Failed to build authenticator for email validation"
    );
    res.redirect(
      302,
      `${config.getAppUrl()}/email/validation-confirmed?status=error`
    );
    return;
  }

  // Validate the action.
  const validateResult = await validateActionFromEmail(auth, {
    actionId,
    approvalState,
  });

  if (validateResult.isErr()) {
    const error = validateResult.error;
    logger.error(
      { actionId, error: error.message, errorCode: error.code },
      "[email] Failed to validate action from email"
    );

    // Action not blocked anymore likely means it was already validated.
    const status =
      error.code === "action_not_blocked" ? "already_validated" : "error";

    res.redirect(
      302,
      `${config.getAppUrl()}/email/validation-confirmed?status=${status}&conversationId=${conversationSId}&workspaceId=${workspaceSId}`
    );
    return;
  }

  const status = approvalState === "approved" ? "approved" : "rejected";

  // Redirect to confirmation page.
  res.redirect(
    302,
    `${config.getAppUrl()}/email/validation-confirmed?status=${status}&conversationId=${conversationSId}&workspaceId=${workspaceSId}`
  );
}

export default withLogging(handler);
