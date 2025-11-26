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

  // Must start with / (relative path)
  if (!path.startsWith("/")) {
    return { valid: false, sanitizedPath: null };
  }

  // Reject protocol-relative URLs (//example.com)
  if (path.startsWith("//")) {
    return { valid: false, sanitizedPath: null };
  }

  // Try to parse as URL to extract only pathname and search
  // This also validates the URL structure
  try {
    const url = new URL(path, "http://localhost");
    // Ensure no host was somehow injected
    if (url.hostname !== "localhost") {
      return { valid: false, sanitizedPath: null };
    }
    // Return only the pathname and search params (no host, protocol, etc.)
    return { valid: true, sanitizedPath: url.pathname + url.search };
  } catch {
    // If URL parsing fails, reject
    return { valid: false, sanitizedPath: null };
  }
};
