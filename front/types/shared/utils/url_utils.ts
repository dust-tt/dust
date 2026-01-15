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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
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

/**
 * Validates and sanitizes a path to ensure it's a relative path.
 * This prevents open redirect vulnerabilities by rejecting absolute URLs.
 * @param path - The path string to validate (e.g., from returnTo parameter)
 * @returns Object with valid flag and sanitized path (pathname + search only)
 */
export const validateRelativePath = (
  path: string | string[] | undefined
):
  | {
      valid: false;
      sanitizedPath: null;
    }
  | {
      valid: true;
      sanitizedPath: string;
    } => {
  // Reject non-string or empty values
  if (typeof path !== "string" || path.trim() === "") {
    return { valid: false, sanitizedPath: null };
  }

  // Safely decode percent-encoded input to prevent bypasses such as /%2F%2Fattacker.com
  // Decode iteratively to handle double-encoding (e.g., %252F -> %2F)
  let decodedPath = path;
  try {
    for (let i = 0; i < 5; i++) {
      const next = decodeURIComponent(decodedPath);
      if (next === decodedPath) {
        break;
      }
      decodedPath = next;
    }
  } catch {
    // Malformed percent-encoding - reject
    return { valid: false, sanitizedPath: null };
  }

  // Must start with / (relative path)
  if (!decodedPath.startsWith("/")) {
    return { valid: false, sanitizedPath: null };
  }

  // Reject protocol-relative URLs (//example.com)
  if (decodedPath.startsWith("//")) {
    return { valid: false, sanitizedPath: null };
  }

  // Try to parse as URL to extract only pathname and search
  // This also validates the URL structure
  try {
    const url = new URL(decodedPath, "http://localhost");
    // Ensure no host was somehow injected
    if (url.hostname !== "localhost") {
      return { valid: false, sanitizedPath: null };
    }
    // Ensure normalized pathname does not start with protocol-relative marker
    if (url.pathname.startsWith("//")) {
      return { valid: false, sanitizedPath: null };
    }
    // Return only the pathname and search params (no host, protocol, etc.)
    return { valid: true, sanitizedPath: url.pathname + url.search };
  } catch {
    // If URL parsing fails, reject
    return { valid: false, sanitizedPath: null };
  }
};

/**
 * Check if a string is an IP address (IPv4 or IPv6).
 * Used to reject IP addresses when matching against domain names.
 */
export function isIpAddress(host: string): boolean {
  // IPv4: four groups of 1-3 digits separated by dots, each 0-255
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]];
    const allValid = octets.every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
    if (allValid) {
      return true;
    }
  }

  // IPv6: contains colons and only hex digits, colons, dots (for IPv4-mapped)
  if (host.includes(":")) {
    if (/^[0-9a-f:.]+$/i.test(host)) {
      const parts = host.split(":");
      if (parts.length <= 9) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a host is under a domain.
 * - Exact match: host === domain
 * - Subdomain match: host ends with '.' + domain
 * Both are normalized to lowercase and trailing dots are removed.
 */
export function isHostUnderDomain(host: string, domain: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  const normalizedDomain = domain.toLowerCase().replace(/\.$/, "");

  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith("." + normalizedDomain)
  );
}
