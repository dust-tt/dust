import { z } from "zod";

export const GMAIL_SEND_MAIL_SCHEMA = {
  to: z
    .array(z.string())
    .optional()
    .describe(
      "The email addresses of the recipients (optional if replyToMessageId is set, acts as override)."
    ),
  cc: z
    .array(z.string())
    .optional()
    .describe(
      "The CC email addresses (optional, acts as override if replyToMessageId is set)."
    ),
  bcc: z
    .array(z.string())
    .optional()
    .describe(
      "The BCC email addresses (optional, acts as override if replyToMessageId is set)."
    ),
  from: z
    .string()
    .email()
    .optional()
    .describe(
      "Optional. The email address to send from. Must be configured as a send-as alias in the user's Gmail settings (e.g. a shared Google Group address like team@company.com). If omitted, Gmail will use the authenticated user's primary address."
    ),
  subject: z
    .string()
    .optional()
    .describe(
      "The subject line of the email (required if replyToMessageId is not set, must be omitted if replyToMessageId is set)."
    ),
  contentType: z
    .enum(["text/plain", "text/html"])
    .optional()
    .describe(
      "The content type of the email body, use text/plain for plain text or text/html for HTML (required if replyToMessageId is not set, must be omitted if replyToMessageId is set (forced to text/html))."
    ),
  body: z.string().describe("The body of the email"),
  replyToMessageId: z
    .string()
    .optional()
    .describe(
      "Optional. The ID of the message to reply to. If provided, the email will be sent as a reply in the existing thread, with proper threading headers and the original message quoted."
    ),
  attachmentFilePath: z
    .string()
    .optional()
    .describe(
      "Optional. Scoped path of the file to attach to the email (e.g. `conversation-<id>/report.pdf` or `pod-<id>/data.csv`)."
    ),
};

const GmailSendMailInputSchema = z.object(GMAIL_SEND_MAIL_SCHEMA);

export type GmailSendMailInput = z.infer<typeof GmailSendMailInputSchema>;

export function isGmailSendMailInput(
  input: Record<string, unknown>
): input is GmailSendMailInput {
  return GmailSendMailInputSchema.safeParse(input).success;
}
