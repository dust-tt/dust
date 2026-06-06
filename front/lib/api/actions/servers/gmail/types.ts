import {
  GMAIL_SEND_MAIL_TOOL_NAME,
  GMAIL_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/gmail/metadata";
import { z } from "zod";

const GmailSendMailInputSchema = z.object(
  GMAIL_TOOLS_METADATA[GMAIL_SEND_MAIL_TOOL_NAME].schema
);

export type GmailSendMailInput = z.infer<typeof GmailSendMailInputSchema>;

export function isGmailSendMailInput(
  input: Record<string, unknown>
): input is GmailSendMailInput {
  return GmailSendMailInputSchema.safeParse(input).success;
}
