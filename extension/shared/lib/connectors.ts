interface Provider {
  matcher: (url: URL) => boolean;
  extractor: (url: URL) => string | null;
}

const providers: Record<string, Provider> = {
  googleDrive: {
    matcher: (url: URL): boolean => {
      return (
        url.hostname.includes("drive.google.com") ||
        url.hostname.includes("docs.google.com")
      );
    },
    extractor: (url: URL): string | null => {
      // Extract from /d/ID format (common in all Google Drive URLs)
      const driveMatch = url.pathname.match(/\/d\/([^/]+)/);
      if (driveMatch && driveMatch[1]) {
        return `gdrive-${driveMatch[1]}`;
      }

      // Extract from URL parameters (some older Drive formats)
      const idParam = url.searchParams.get("id");
      if (idParam) {
        return `gdrive-${idParam}`;
      }

      return null;
    },
  },

  notion: {
    matcher: (url: URL): boolean => {
      return url.hostname.includes("notion.so");
    },
    extractor: (url: URL): string | null => {
      // Get the last part of the path, which contains the ID
      const pathParts = url.pathname.split("/");
      const lastPart = pathParts[pathParts.length - 1];

      // Notion IDs are 32 characters, often at the end of the URL path
      if (lastPart) {
        // Extract the ID part (after the last dash in the page title if present)
        const parts = lastPart.split("-");
        const idCandidate = parts[parts.length - 1];

        // If we have a 32-character ID (with or without hyphens)
        if (idCandidate && idCandidate.replace(/-/g, "").length === 32) {
          return idCandidate;
        }
      }

      return null;
    },
  },
};

// Extracts a nodeId from a given url
// Currently supports Google Drive documents and Notion pages
export function nodeIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    for (const provider of Object.values(providers)) {
      if (provider.matcher(urlObj)) {
        return provider.extractor(urlObj);
      }
    }

    return null;
  } catch (error) {
    console.error("Error parsing URL:", error);
    return null;
  }
}
