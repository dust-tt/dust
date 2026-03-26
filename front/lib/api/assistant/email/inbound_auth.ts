import type { InboundEmail } from "@app/lib/api/assistant/email/email_trigger";

const REPEATED_DKIM_ENTRY_SEPARATOR_PATTERN = /\}\s*,?\s*\{/g;
const SENDGRID_DKIM_ENTRY_PATTERN = /^@([^:\s]+)\s*:\s*([^,\s}]+)$/;

export type InboundEmailDkimResult = {
  domain: string;
  result: string;
};

export type InboundAuthDecision = {
  authenticated: boolean;
  // Which path granted authentication (undefined when rejected).
  reason?: "aligned_dkim" | "aligned_spf";
  headerFromDomain: string;
  spfResult: string;
  spfEnvelopeDomain: string;
  dkimEntries: InboundEmailDkimResult[];
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

  return domain.toLowerCase();
}

/**
 * Relaxed domain alignment per DMARC RFC 7489 §3.1.
 * Two domains are aligned when they share the same organizational domain,
 * i.e. one is a subdomain of the other or they are equal.
 *
 * Limitation: this is suffix-based, not PSL-aware — domains under public
 * suffixes like co.uk could incorrectly align (e.g. a.co.uk / b.co.uk).
 * TODO: replace with PSL-aware organizational-domain extraction.
 */
export function domainsAlign(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();

  if (la === lb) {
    return true;
  }

  // One is a subdomain of the other: "mail.example.com" aligns with "example.com".
  return la.endsWith(`.${lb}`) || lb.endsWith(`.${la}`);
}

/**
 * DMARC-style inbound sender authentication against the header From: domain.
 * Accepts if:
 * - At least one DKIM signature passes for a domain aligned with the From: domain, OR
 * - SPF passes and the envelope-from domain aligns with the From: domain.
 */
export function evaluateInboundAuth(
  email: Pick<InboundEmail, "auth" | "sender" | "envelope">
): InboundAuthDecision {
  const headerFromDomain = getEmailDomain(email.sender.email);
  const envelopeDomain = getEmailDomain(email.envelope.from);

  const base = {
    headerFromDomain,
    spfResult: email.auth.SPF,
    spfEnvelopeDomain: envelopeDomain,
    dkimEntries: email.auth.dkim,
  };

  // Path 1: aligned DKIM pass.
  const hasAlignedPassingDkim = email.auth.dkim.some(
    (entry) =>
      entry.result === "pass" && domainsAlign(entry.domain, headerFromDomain)
  );

  if (hasAlignedPassingDkim) {
    return { ...base, authenticated: true, reason: "aligned_dkim" };
  }

  // Path 2: SPF pass with aligned envelope domain.
  const spfPasses = email.auth.SPF.toLowerCase() === "pass";
  const spfDomainAligns = domainsAlign(envelopeDomain, headerFromDomain);

  if (spfPasses && spfDomainAligns) {
    return { ...base, authenticated: true, reason: "aligned_spf" };
  }

  return { ...base, authenticated: false };
}
