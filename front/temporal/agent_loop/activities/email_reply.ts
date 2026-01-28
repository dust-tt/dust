import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type {
  EmailReplyContext,
  InboundEmail,
} from "@app/lib/api/assistant/email_trigger";
import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  getAndDeleteEmailReplyContext,
} from "@app/lib/api/assistant/email_trigger";
import { sendEmail } from "@app/lib/api/email";
import type { AuthenticatorType } from "@app/lib/auth";
import { getConversationRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getAgentLoopData } from "@app/types/assistant/agent_run";

const { DUST_CLIENT_FACING_URL = "", PRODUCTION_DUST_WORKSPACE_ID = "" } =
  process.env;

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
 */
function checkEmailReplyGating(
  context: EmailReplyContext,
  agentMessageId: string
): boolean {
  // Security gating: only allow replies to dust.tt emails in the Dust workspace.
  // This mirrors the checks in the webhook handler.
  if (!context.fromEmail.endsWith("@dust.tt")) {
    logger.warn(
      { agentMessageId, fromEmail: context.fromEmail },
      "[email] Sender email not in @dust.tt domain, skipping reply"
    );
    return false;
  }
  if (
    PRODUCTION_DUST_WORKSPACE_ID &&
    context.workspaceSId !== PRODUCTION_DUST_WORKSPACE_ID
  ) {
    logger.warn(
      { agentMessageId, workspaceSId: context.workspaceSId },
      "[email] Workspace not gated for email replies, skipping reply"
    );
    return false;
  }
  return true;
}

/**
 * Send an email reply after agent message completion.
 * This is a fire-and-forget operation: failures are logged but don't fail the workflow.
 */
export async function emailReplyOnCompletionActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  try {
    // Only process email-originated messages.
    if (agentLoopArgs.userMessageOrigin !== "email") {
      return;
    }

    const context = await getAndDeleteEmailReplyContext(
      agentLoopArgs.agentMessageId
    );
    if (!context) {
      // Context not found - either expired, never stored, or already processed.
      // This is expected for non-email messages or if already replied.
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

    // Get agent configuration for the reply sender name.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: context.agentConfigurationSId,
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
      context.workspaceSId,
      conversation.sId,
      undefined,
      DUST_CLIENT_FACING_URL
    );
    const fullHtmlContent = `<div><div>${htmlContent}</div><br/><a href="${conversationLink}">Open in Dust</a></div>`;

    // Reconstruct the email and send reply.
    const email = reconstructEmailFromContext(context);
    await replyToEmailInternal({
      email,
      agentConfiguration,
      htmlContent: fullHtmlContent,
    });

    logger.info(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        conversationId: conversation.sId,
        to: context.fromEmail,
      },
      "[email] Sent email reply on agent completion"
    );
  } catch (err) {
    // Fire-and-forget: log warning but don't fail the workflow.
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
 * Internal version of replyToEmail that sends the actual email.
 * Duplicated from email_trigger.ts to avoid circular dependencies
 * and to keep this activity self-contained.
 */
async function replyToEmailInternal({
  email,
  agentConfiguration,
  htmlContent,
}: {
  email: InboundEmail;
  agentConfiguration: { name: string } | null;
  htmlContent: string;
}) {
  const name = agentConfiguration
    ? `Dust Agent (${agentConfiguration.name})`
    : "Dust Agent";
  const sender = agentConfiguration
    ? `${agentConfiguration.name}@${ASSISTANT_EMAIL_SUBDOMAIN}`
    : `assistants@${ASSISTANT_EMAIL_SUBDOMAIN}`;

  // Subject: if Re: is already there, don't add it.
  const subject = email.subject
    .toLowerCase()
    .replaceAll(" ", "")
    .startsWith("re:")
    ? email.subject
    : `Re: ${email.subject}`;

  const quote = email.text
    .replaceAll(">", "&gt;")
    .replaceAll("<", "&lt;")
    .split("\n")
    .join("<br/>\n");

  const html =
    "<div>\n" +
    htmlContent +
    `<br/><br/>` +
    `On ${new Date().toUTCString()} ${sanitizeHtml(email.envelope.full, { allowedTags: [], allowedAttributes: {} })} wrote:<br/>\n` +
    `<blockquote class="quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">\n` +
    `${quote}` +
    `</blockquote>\n` +
    "<div>\n";

  const msg = {
    from: {
      name,
      email: sender,
    },
    reply_to: sender,
    subject,
    html,
  };

  await sendEmail(email.envelope.from, msg);
}

/**
 * Send an error email on agent error/cancellation.
 * This mirrors the prior behavior where errors were reported back to the sender.
 * Fire-and-forget: failures are logged but don't fail the workflow.
 */
export async function emailReplyOnErrorActivity(
  agentLoopArgs: AgentLoopArgs,
  errorMessage: string
): Promise<void> {
  try {
    if (agentLoopArgs.userMessageOrigin !== "email") {
      return;
    }

    const context = await getAndDeleteEmailReplyContext(
      agentLoopArgs.agentMessageId
    );
    if (!context) {
      logger.info(
        { agentMessageId: agentLoopArgs.agentMessageId },
        "[email] No email reply context found for error reply, skipping"
      );
      return;
    }

    if (!checkEmailReplyGating(context, agentLoopArgs.agentMessageId)) {
      return;
    }

    const email = reconstructEmailFromContext(context);
    const htmlContent =
      `<p>Error running agent:</p>\n` + `<p>${errorMessage}</p>\n`;

    await replyToEmailInternal({
      email,
      agentConfiguration: null,
      htmlContent,
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
