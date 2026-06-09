import {
  getActionContextForEmailValidation,
  validateActionFromEmail,
} from "@app/lib/api/assistant/email/validate_tool_from_email";
import config from "@app/lib/api/config";
import { verifyValidationToken } from "@app/lib/api/email/validation_token";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import { createHono } from "@front-api/lib/hono";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/email/validate-action.
const app = createHono();

/** @ignoreswagger */
app.post("/", async (ctx) => {
  const body = await ctx.req.json().catch(() => ({}));
  const { token } = body ?? {};
  if (!isString(token)) {
    return apiError(ctx, {
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

    return ctx.redirect(
      `${config.getAppUrl()}/email/validation?status=${errorMessage}`,
      302
    );
  }

  const { actionId, approvalState } = tokenResult.value;

  // Get action context to build authenticator.
  const contextResult = await getActionContextForEmailValidation(actionId);
  if (contextResult.isErr()) {
    logger.error(
      { actionId, error: contextResult.error.message },
      "[email] Failed to get action context for email validation"
    );
    return ctx.redirect(
      `${config.getAppUrl()}/email/validation?status=error`,
      302
    );
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
    return ctx.redirect(
      `${config.getAppUrl()}/email/validation?status=error`,
      302
    );
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

    return ctx.redirect(
      `${config.getAppUrl()}/email/validation?status=${status}&conversationId=${conversationId}&workspaceId=${workspaceId}`,
      302
    );
  }

  const status = approvalState === "approved" ? "approved" : "rejected";

  return ctx.redirect(
    `${config.getAppUrl()}/email/validation?status=${status}&conversationId=${conversationId}&workspaceId=${workspaceId}`,
    302
  );
});

export default app;
