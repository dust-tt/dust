import type { InboundEmail } from "@app/lib/api/assistant/email/email_trigger";

function getEmailDomain(email: string): string {
  const [, domain] = email.split("@");

  if (!domain) {
    throw new Error(`Invalid email address: ${email}`);
  }

  return domain;
}

export function isAuthenticatedInboundSender(
  email: Pick<InboundEmail, "auth" | "sender" | "envelope">
): boolean {
  const senderDomain = getEmailDomain(email.sender.email);
  const envelopeDomain = getEmailDomain(email.envelope.from);

  return (
    email.auth.SPF === "pass" &&
    senderDomain === envelopeDomain &&
    email.auth.dkim.some(
      ({ domain, result }) => domain === envelopeDomain && result === "pass"
    )
  );
}
