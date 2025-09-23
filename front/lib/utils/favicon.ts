/**
 * Utility functions for fetching and handling website favicons
 */

/**
 * Extract domain from a URL
 */
function getDomainFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch {
    return null;
  }
}

/**
 * Get favicon URL for a given website URL
 * Uses multiple fallback strategies to find the best favicon
 */
export function getFaviconUrl(websiteUrl: string): string | null {
  const domain = getDomainFromUrl(websiteUrl);
  if (!domain) {
    return null;
  }

  // Use Google's favicon service as it handles fallbacks and provides consistent results
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
}
