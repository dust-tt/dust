import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type {
  EmailReplyContext,
  InboundEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import {
  deleteEmailReplyContext,
  getEmailReplyContext,
  replyToEmail,
  sendToolValidationEmail,
  storeEmailReplyContext,
} from "@app/lib/api/assistant/email/email_trigger";
import config from "@app/lib/api/config";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getAgentLoopData } from "@app/types/assistant/agent_run";
import { isDevelopment } from "@app/types/shared/env";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Reconstructs a minimal InboundEmail from the stored context.
 * Only includes fields needed for replyToEmail.
 */
function reconstructEmailFromContext(context: EmailReplyContext): InboundEmail {
  return {
    subject: context.subject,
    text: context.originalText,
    auth: { SPF: "", dkim: "" },
    threadingHeaders: {
      messageId: context.threadingMessageId,
      inReplyTo: context.threadingInReplyTo,
      references: context.threadingReferences,
    },
    envelope: {
      to: [],
      cc: [],
      bcc: [],
      from: context.fromEmail,
      full: context.fromFull,
    },
    attachments: [],
  };
}

/**
 * Check security gating for email replies.
 * Returns true if the reply should be sent, false otherwise.
 *
 * Defense-in-depth: duplicates the webhook handler checks as a second layer
 * of protection in case Redis data is manipulated or context is stored incorrectly.
 */
function checkEmailReplyGating(
  context: EmailReplyContext,
  agentMessageId: string
): boolean {
  // Security gating: only allow replies to dust.tt emails in the Dust workspace.
  if (!context.fromEmail.endsWith("@dust.tt")) {
    logger.warn(
      { agentMessageId, fromEmail: context.fromEmail },
      "[email] Sender email not in @dust.tt domain, skipping reply"
    );
    return false;
  }
  const productionDustWorkspaceId = config.getProductionDustWorkspaceId();
  if (
    !isDevelopment() &&
    productionDustWorkspaceId &&
    context.workspaceId !== productionDustWorkspaceId
  ) {
    logger.warn(
      { agentMessageId, workspaceId: context.workspaceId },
      "[email] Workspace not gated for email replies, skipping reply"
    );
    return false;
  }
  return true;
}

/**
 * Check if the agent is blocked on tool validation.
 * If so, send a validation email and re-store the context with fresh TTL.
 * Returns true if blocked (validation email sent), false otherwise.
 */
async function handleBlockedValidation(
  auth: Authenticator,
  agentMessageSId: string,
  context: EmailReplyContext
): Promise<boolean> {
  const conversationResource = await ConversationResource.fetchById(
    auth,
    context.conversationId
  );
  if (!conversationResource) {
    logger.warn(
      {
        agentMessageId: agentMessageSId,
        conversationId: context.conversationId,
      },
      "[email] Conversation not found for blocked validation check"
    );
    return false;
  }

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversationResource
    );

  const validationRequiredActions = blockedActions.filter(
    (action) =>
      action.status === "blocked_validation_required" &&
      action.messageId === agentMessageSId
  );

  if (validationRequiredActions.length === 0) {
    return false;
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: context.agentConfigurationId,
    variant: "light",
  });
  if (!agentConfiguration) {
    logger.warn(
      {
        agentMessageId: agentMessageSId,
        agentConfigurationId: context.agentConfigurationId,
      },
      "[email] Agent configuration not found for blocked validation check"
    );
    return false;
  }

  const email = reconstructEmailFromContext(context);

  await sendToolValidationEmail({
    email,
    agentConfiguration,
    blockedActions: validationRequiredActions,
    conversation: { sId: context.conversationId },
    workspace: auth.getNonNullableWorkspace(),
  });

  // Re-store context with fresh TTL so it's available when agent resumes.
  await storeEmailReplyContext(agentMessageSId, context);

  logger.info(
    {
      agentMessageId: agentMessageSId,
      conversationId: context.conversationId,
      blockedActionsCount: validationRequiredActions.length,
    },
    "[email] Agent blocked on tool validation, sent approval email"
  );

  return true;
}

/**
 * Send an email reply after agent message completion.
 * If the agent is blocked on tool validation, sends a validation email instead.
 * Fire-and-forget: failures are logged but don't throw.
 */
export async function sendEmailReplyOnCompletion(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  try {
    // Only process email-originated messages.
    if (agentLoopArgs.userMessageOrigin !== "email") {
      return;
    }

    // Read without deleting — only delete after actually sending the final reply.
    const context = await getEmailReplyContext(
      authType.workspaceId,
      agentLoopArgs.agentMessageId
    );
    if (!context) {
      logger.info(
        { agentMessageId: agentLoopArgs.agentMessageId },
        "[email] No email reply context found, skipping reply"
      );
      return;
    }

    if (!checkEmailReplyGating(context, agentLoopArgs.agentMessageId)) {
      return;
    }

    // Get the completed agent message data.
    const dataRes = await getAgentLoopData(authType, agentLoopArgs);
    if (dataRes.isErr()) {
      logger.warn(
        {
          agentMessageId: agentLoopArgs.agentMessageId,
          error: dataRes.error,
        },
        "[email] Failed to get agent loop data for email reply"
      );
      return;
    }

    const { auth, agentMessage, conversation } = dataRes.value;

    // Check if blocked on tool validation — send validation email instead.
    const blocked = await handleBlockedValidation(
      auth,
      agentMessage.sId,
      context
    );
    if (blocked) {
      return;
    }

    // No blocked actions — send the normal reply and delete the context.
    await deleteEmailReplyContext(
      authType.workspaceId,
      agentLoopArgs.agentMessageId
    );

    // Get agent configuration for the reply sender name.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: context.agentConfigurationId,
      variant: "light",
    });

    // Render the agent message content as HTML.
    const htmlContent = sanitizeHtml(
      await marked.parse(agentMessage.content ?? ""),
      {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
      }
    );

    // Build the full HTML with conversation link.
    const conversationLink = getConversationRoute(
      context.workspaceId,
      conversation.sId,
      undefined,
      config.getClientFacingUrl()
    );
    const fullHtmlContent = `<div><div>${htmlContent}</div><br/><a href="${conversationLink}">Open in Dust</a></div>`;

    // Reconstruct the email and send reply.
    const email = reconstructEmailFromContext(context);
    await replyToEmail({
      email,
      agentConfiguration: agentConfiguration ?? undefined,
      htmlContent: fullHtmlContent,
      recipients: {
        to: context.replyTo,
        cc: context.replyCc,
      },
    });

    logger.info(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        conversationId: conversation.sId,
        to: context.replyTo,
        cc: context.replyCc,
      },
      "[email] Sent email reply on agent completion"
    );
  } catch (err) {
    logger.warn(
      {
        err,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "[email] Failed to send email reply on completion, skipping"
    );
  }
}

/**
 * Send an error email on agent error/cancellation.
 * Fire-and-forget: failures are logged but don't throw.
 */
export async function sendEmailReplyOnError(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs,
  errorMessage: string
): Promise<void> {
  try {
    if (agentLoopArgs.userMessageOrigin !== "email") {
      return;
    }

    const context = await getEmailReplyContext(
      authType.workspaceId,
      agentLoopArgs.agentMessageId
    );
    if (!context) {
      logger.info(
        { agentMessageId: agentLoopArgs.agentMessageId },
        "[email] No email reply context found for error reply, skipping"
      );
      return;
    }

    await deleteEmailReplyContext(
      authType.workspaceId,
      agentLoopArgs.agentMessageId
    );

    if (!checkEmailReplyGating(context, agentLoopArgs.agentMessageId)) {
      return;
    }

    const email = reconstructEmailFromContext(context);
    const htmlContent =
      `<p>Error running agent:</p>\n` +
      `<p>${sanitizeHtml(errorMessage, { allowedTags: [], allowedAttributes: {} })}</p>\n`;

    await replyToEmail({
      email,
      htmlContent,
      recipients: {
        to: [context.fromEmail],
        cc: [],
      },
    });

    logger.info(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        to: context.fromEmail,
        errorMessage,
      },
      "[email] Sent error email reply"
    );
  } catch (err) {
    logger.warn(
      {
        err,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "[email] Failed to send error email reply, skipping"
    );
  }
}
