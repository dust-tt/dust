import { promises as dns } from "dns";

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

export type EmailProviderType = "google" | "microsoft" | "other";

async function resolveMxRecords(
  domain: string
): Promise<Awaited<ReturnType<typeof dns.resolveMx>> | null> {
  try {
    return await Promise.race([
      dns.resolveMx(domain),
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
 */
export async function detectEmailProvider(
  email: string
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
