import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

export function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

export async function hasValidMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}
