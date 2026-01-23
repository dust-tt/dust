import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

/**
 * Extract domain from an email address.
 */
export function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check if a domain has valid MX records.
 */
export async function hasValidMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    // ENODATA, ENOTFOUND, etc. - domain has no MX records
    return false;
  }
}
