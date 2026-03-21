import type { InboundEmail } from "@app/lib/api/assistant/email/email_trigger";

const REPEATED_DKIM_ENTRY_SEPARATOR_PATTERN = /\}\s*,?\s*\{/g;
const SENDGRID_DKIM_ENTRY_PATTERN = /^@([^:\s]+)\s*:\s*([^,\s}]+)$/;

export type InboundEmailDkimResult = {
  domain: string;
  result: string;
};

export function parseSendgridDkimResults(
  rawDkim: string | null
): InboundEmailDkimResult[] {
  if (!rawDkim) {
    return [];
  }

  const trimmedDkim = rawDkim.trim();
  if (!trimmedDkim.startsWith("{") || !trimmedDkim.endsWith("}")) {
    return [];
  }

  const normalizedDkim = trimmedDkim
    .replace(REPEATED_DKIM_ENTRY_SEPARATOR_PATTERN, ",")
    .slice(1, -1);
  if (normalizedDkim.length === 0) {
    return [];
  }

  const dkimResults: InboundEmailDkimResult[] = [];
  for (const entry of normalizedDkim.split(",")) {
    const match = entry.trim().match(SENDGRID_DKIM_ENTRY_PATTERN);
    if (!match) {
      return [];
    }

    const [, domain, result] = match;
    dkimResults.push({
      domain: domain.toLowerCase(),
      result: result.toLowerCase(),
    });
  }

  return dkimResults;
}

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
