import {
  getActionContextForEmailValidation,
  validateActionFromEmail,
} from "@app/lib/api/assistant/email/validate_tool_from_email";
import config from "@app/lib/api/config";
import { verifyValidationToken } from "@app/lib/api/email/validation_token";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type ValidateActionResponse = {
  success: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ValidateActionResponse>>
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST requests are supported.",
      },
    });
  }

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

    res.redirect(
      302,
      `${config.getAppUrl()}/email/validation?status=${errorMessage}`
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
    res.redirect(302, `${config.getAppUrl()}/email/validation?status=error`);
    return;
  }

  const { workspaceId, conversationId, userId } = contextResult.value;

  // Build authenticator for the user who triggered the email.
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspaceId
  );
  if (!auth) {
    logger.error(
      { userId, workspaceId },
      "[email] Failed to build authenticator for email validation"
    );
    res.redirect(302, `${config.getAppUrl()}/email/validation?status=error`);
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
      `${config.getAppUrl()}/email/validation?status=${status}&conversationId=${conversationId}&workspaceId=${workspaceId}`
    );
    return;
  }

  const status = approvalState === "approved" ? "approved" : "rejected";

  res.redirect(
    302,
    `${config.getAppUrl()}/email/validation?status=${status}&conversationId=${conversationId}&workspaceId=${workspaceId}`
  );
}

export default withLogging(handler);
