import { promises as dns } from "dns";

import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";

// Known consumer email domains by provider - no MX lookup needed.
const KNOWN_GOOGLE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const KNOWN_MICROSOFT_DOMAINS = new Set([
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
]);

// DNS lookup timeout in milliseconds.
const DNS_TIMEOUT_MS = 2000;

// Rate limiting: max 10 DNS lookups per key per minute.
const RATE_LIMIT_MAX_LOOKUPS = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// Validates that a domain is safe to perform DNS lookups on.
function isValidExternalDomain(domain: string): boolean {
  if (!domain || !domain.trim()) {
    return false;
  }

  // Reject if domain looks like an IP address (v4 or v6).
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^[\da-fA-F:]+$/;
  if (ipv4Pattern.test(domain) || ipv6Pattern.test(domain)) {
    return false;
  }

  // Reject localhost variants.
  if (domain === "localhost" || domain.endsWith(".localhost")) {
    return false;
  }

  // Require at least one dot (rejects single-label domains).
  if (!domain.includes(".")) {
    return false;
  }

  return true;
}

export type EmailProviderType = "google" | "microsoft" | "other";

async function resolveMxRecords(
  domain: string
): Promise<Awaited<ReturnType<typeof dns.resolveMx>> | null> {
  try {
    const dnsPromise = dns.resolveMx(domain);
    // Prevent unhandled rejection if timeout wins the race.
    dnsPromise.catch(() => {});

    return await Promise.race([
      dnsPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DNS timeout")), DNS_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    logger.warn(
      { domain, error: err },
      "Failed to resolve MX records for email provider detection"
    );
    return null;
  }
}

/**
 * Detect the email provider for an email address.
 *
 * For known consumer domains, returns the provider immediately.
 * For other domains, performs an MX record lookup to detect:
 * - Google Workspace: MX records ending in .google.com or .googlemail.com
 * - Microsoft 365: MX records ending in .outlook.com or .protection.outlook.com
 *
 * @param email - The email address to detect provider for.
 * @param rateLimitKey - Optional key for rate limiting (e.g., IP address). If provided and rate
 *   limit is exceeded, returns "other" without performing DNS lookup.
 */
export async function detectEmailProvider(
  email: string,
  rateLimitKey?: string
): Promise<EmailProviderType> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return "other";
  }

  if (KNOWN_GOOGLE_DOMAINS.has(domain)) {
    return "google";
  }
  if (KNOWN_MICROSOFT_DOMAINS.has(domain)) {
    return "microsoft";
  }

  // Validate domain before DNS lookup to prevent SSRF.
  if (!isValidExternalDomain(domain)) {
    return "other";
  }

  // Check rate limit if key provided.
  if (rateLimitKey) {
    const remaining = await rateLimiter({
      key: `email_provider_dns:${rateLimitKey}`,
      maxPerTimeframe: RATE_LIMIT_MAX_LOOKUPS,
      timeframeSeconds: RATE_LIMIT_WINDOW_SECONDS,
      logger,
    });
    if (remaining <= 0) {
      logger.warn(
        { rateLimitKey, domain },
        "Rate limit exceeded for email provider DNS lookup"
      );
      return "other";
    }
  }

  const records = await resolveMxRecords(domain);
  if (!records) {
    return "other";
  }

  for (const r of records) {
    const exchange = r.exchange.toLowerCase();

    if (
      exchange.endsWith(".google.com") ||
      exchange.endsWith(".googlemail.com")
    ) {
      return "google";
    }

    if (
      exchange.endsWith(".outlook.com") ||
      exchange.endsWith(".protection.outlook.com")
    ) {
      return "microsoft";
    }
  }

  return "other";
}
