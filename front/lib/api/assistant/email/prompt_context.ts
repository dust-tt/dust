import type { EmailReplyContext } from "@app/lib/api/assistant/email/email_trigger";

function formatRecipients(recipients: string[]): string {
  return recipients.join(", ");
}

export function buildEmailResponseAudienceContext(
  context: Pick<EmailReplyContext, "replyTo" | "replyCc"> | null
): string {
  const lines = [
    "<email_response_audience>",
    "The user sent you this message by email.",
    "You have access to the email thread content and to any attachments available in this conversation.",
  ];

  if (context === null) {
    lines.push(
      "Your response will be sent as an email reply to the sender and possibly other recipients on the thread.",
      "Write your response with that audience in mind."
    );
  } else if (context.replyTo.length === 1 && context.replyCc.length === 0) {
    lines.push(
      "Your response will be sent as an email reply only to:",
      `To: ${formatRecipients(context.replyTo)}`,
      "Assume the listed recipient will read your response.",
      "Write your response with that audience in mind."
    );
  } else {
    lines.push(
      "Your response will be sent as an email reply to these recipients:",
      `To: ${formatRecipients(context.replyTo)}`
    );

    if (context.replyCc.length > 0) {
      lines.push(`Cc: ${formatRecipients(context.replyCc)}`);
    }

    lines.push(
      "Assume all listed recipients will read your response.",
      "Write your response with that audience in mind."
    );
  }

  lines.push("</email_response_audience>");

  return lines.join("\n");
}
