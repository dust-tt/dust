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

/**
 * Check if a favicon URL is valid and loads successfully
 */
export function validateFaviconUrl(faviconUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      // Check if the image is not the default broken image (1x1 transparent pixel)
      if (img.naturalWidth > 1 && img.naturalHeight > 1) {
        resolve(true);
      } else {
        resolve(false);
      }
    };
    
    img.onerror = () => {
      resolve(false);
    };
    
    img.src = faviconUrl;
    
    // Timeout after 3 seconds
    setTimeout(() => {
      resolve(false);
    }, 3000);
  });
}