/**
 * Raw email sending through SendGrid, used only by email agents to reply to inbound emails (custom
 * sender per agent, threading headers). Every other email is a Novu workflow under
 * `lib/notifications`.
 */

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import sgMail from "@sendgrid/mail";

let sgMailClient: typeof sgMail | null = null;

function getSgMailClient(): any {
  if (!sgMailClient) {
    sgMail.setApiKey(config.getSendgridApiKey());
    sgMailClient = sgMail;
  }

  return sgMail;
}

export async function sendEmailToRecipients({
  to,
  cc,
  message,
}: {
  to: string[];
  cc?: string[];
  message: any;
}) {
  // In dev, filter out external recipients and warn rather than blocking the send entirely.
  let filteredTo = to;
  let filteredCc = cc;
  if (isDevelopment()) {
    const isInternal = (r: string) => r.endsWith("@dust.tt");
    filteredTo = to.filter(isInternal);
    filteredCc = cc?.filter(isInternal);
    const externalRecipients = [...to, ...(cc ?? [])].filter(
      (r) => !isInternal(r)
    );
    if (externalRecipients.length > 0) {
      logger.warn(
        { externalRecipients, subject: message.subject },
        "Dropping external recipients in development mode."
      );
    }
    if (filteredTo.length === 0) {
      return;
    }
  }

  const msg = {
    ...message,
    to: filteredTo,
    ...(filteredCc && filteredCc.length > 0 ? { cc: filteredCc } : {}),
  };

  try {
    await getSgMailClient().send(msg);
    logger.info({ to, cc, subject: message.subject }, "Sending email");
  } catch (error) {
    logger.error(
      { error, to, cc, subject: message.subject },
      "Error sending email."
    );
  }
}

export async function sendEmail(email: string, message: any) {
  await sendEmailToRecipients({
    to: [email],
    message,
  });
}
