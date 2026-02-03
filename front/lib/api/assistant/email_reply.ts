import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type {
  EmailReplyContext,
  InboundEmail,
} from "@app/lib/api/assistant/email_trigger";
import {
  getAndDeleteEmailReplyContext,
  replyToEmail,
} from "@app/lib/api/assistant/email_trigger";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getConversationRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types";

const PRODUCTION_DUST_WORKSPACE_ID = config.getProductionDustWorkspaceId();

/**
 * Reconstructs a minimal InboundEmail from the stored context.
 * Only includes fields needed for replyToEmail.
 */
function reconstructEmailFromContext(context: EmailReplyContext): InboundEmail {
  return {
    subject: context.subject,
    text: context.originalText,
    auth: { SPF: "", dkim: "" },
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
  if (
    !isDevelopment() &&
    PRODUCTION_DUST_WORKSPACE_ID &&
    context.workspaceId !== PRODUCTION_DUST_WORKSPACE_ID
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
 * Send an email reply after agent message completion.
 * Fire-and-forget: failures are logged but don't throw.
 */
export async function sendEmailReplyOnCompletion({
  auth,
  workspaceId,
  agentMessageId,
  agentMessageContent,
  conversationId,
}: {
  auth: Authenticator;
  workspaceId: string;
  agentMessageId: string;
  agentMessageContent: string | null;
  conversationId: string;
}): Promise<void> {
  try {
    const context = await getAndDeleteEmailReplyContext(
      workspaceId,
      agentMessageId
    );
    if (!context) {
      // Context not found - either expired, never stored, or already processed.
      logger.info(
        { agentMessageId },
        "[email] No email reply context found, skipping reply"
      );
      return;
    }

    if (!checkEmailReplyGating(context, agentMessageId)) {
      return;
    }

    // Get agent configuration for the reply sender name.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: context.agentConfigurationId,
      variant: "light",
    });

    // Render the agent message content as HTML.
    const htmlContent = sanitizeHtml(
      await marked.parse(agentMessageContent ?? ""),
      {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
      }
    );

    // Build the full HTML with conversation link.
    const conversationLink = getConversationRoute(
      context.workspaceId,
      conversationId,
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
    });

    logger.info(
      {
        agentMessageId,
        conversationId,
        to: context.fromEmail,
      },
      "[email] Sent email reply on agent completion"
    );
  } catch (err) {
    logger.warn(
      {
        err,
        agentMessageId,
      },
      "[email] Failed to send email reply on completion, skipping"
    );
  }
}

/**
 * Send an error email on agent error/cancellation.
 * Fire-and-forget: failures are logged but don't throw.
 */
export async function sendEmailReplyOnError({
  workspaceId,
  agentMessageId,
  errorMessage,
}: {
  workspaceId: string;
  agentMessageId: string;
  errorMessage: string;
}): Promise<void> {
  try {
    const context = await getAndDeleteEmailReplyContext(
      workspaceId,
      agentMessageId
    );
    if (!context) {
      logger.info(
        { agentMessageId },
        "[email] No email reply context found for error reply, skipping"
      );
      return;
    }

    if (!checkEmailReplyGating(context, agentMessageId)) {
      return;
    }

    const email = reconstructEmailFromContext(context);
    const htmlContent =
      `<p>Error running agent:</p>\n` + `<p>${errorMessage}</p>\n`;

    await replyToEmail({
      email,
      htmlContent,
    });

    logger.info(
      {
        agentMessageId,
        to: context.fromEmail,
        errorMessage,
      },
      "[email] Sent error email reply"
    );
  } catch (err) {
    logger.warn(
      {
        err,
        agentMessageId,
      },
      "[email] Failed to send error email reply, skipping"
    );
  }
}
