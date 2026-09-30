/**
 * Check if a host is under a domain.
 * - Exact match: host === domain
 * - Subdomain match: host ends with '.' + domain
 *
 * This is intentionally stricter than a bare `endsWith(domain)` check, which
 * would allow an attacker-controlled domain such as `evilexample.com` to
 * pass an allowlist entry of `example.com`.
 */
export function isHostUnderDomain(host: string, domain: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  const normalizedDomain = domain.toLowerCase().replace(/\.$/, "");

  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith("." + normalizedDomain)
  );
}

export const validateUrl = (
  urlString: string
):
  | {
      valid: false;
      standardized: null;
    }
  | {
      valid: true;
      standardized: string;
    } => {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (_e) {
    return { valid: false, standardized: null };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, standardized: null };
  }

  if (url.pathname.includes("//")) {
    return { valid: false, standardized: null };
  }

  return { valid: true, standardized: url.href };
};
