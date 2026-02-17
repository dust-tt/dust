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
    // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
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

// Pre-compiled regex for IPv4 validation.
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Check if a string is an IP address (IPv4 or IPv6).
 * Uses strict validation - only accepts properly formatted IP addresses.
 */
export function isIpAddress(host: string): boolean {
  // IPv4: exactly four octets, each 0-255
  const ipv4Match = IPV4_REGEX.exec(host);
  if (ipv4Match) {
    return [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].every(
      (octet) => {
        const num = parseInt(octet, 10);
        return num >= 0 && num <= 255;
      }
    );
  }

  // IPv6 in URL format (with brackets)
  if (host.startsWith("[") && host.endsWith("]")) {
    const inner = host.slice(1, -1);
    // Validate by trying to parse as URL
    try {
      new URL(`http://[${inner}]`);
      return true;
    } catch {
      return false;
    }
  }

  // Raw IPv6 without brackets (contains colons, no dots except IPv4-mapped)
  if (host.includes(":") && !host.startsWith("[")) {
    try {
      new URL(`http://[${host}]`);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Normalize a hostname: lowercase and remove trailing dot.
 */
function normalizeHostname(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

/**
 * Check if a host is under a domain.
 * - Exact match: host === domain
 * - Subdomain match: host ends with '.' + domain
 */
export function isHostUnderDomain(host: string, domain: string): boolean {
  const normalizedHost = normalizeHostname(host);
  const normalizedDomain = normalizeHostname(domain);

  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith("." + normalizedDomain)
  );
}
