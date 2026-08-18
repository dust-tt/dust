import { apiConfig } from "@connectors/lib/api/config";
import FirecrawlApp from "@mendable/firecrawl-js";

let firecrawlApp: FirecrawlApp;

export const getFirecrawl = () => {
  if (!firecrawlApp) {
    const { apiKey, apiUrl } = apiConfig.getFirecrawlAPIConfig();
    firecrawlApp = new FirecrawlApp({
      apiKey,
      // When unset, the client defaults to the Firecrawl cloud.
      ...(apiUrl ? { apiUrl } : {}),
    });
  }

  return firecrawlApp;
};

let crwApp: FirecrawlApp;

// fastCRW is a Firecrawl-compatible web scraper (single binary; self-host or
// cloud). It speaks the same REST API as Firecrawl, so we reuse the Firecrawl
// client and only swap the base URL. Defaults to the managed cloud at
// https://fastcrw.com/api; override CRW_API_URL for self-host.
export const getCrw = () => {
  if (!crwApp) {
    const { apiKey, apiUrl } = apiConfig.getCrwAPIConfig();
    crwApp = new FirecrawlApp({
      // Self-hosted fastCRW may run without auth, so the key is optional.
      apiKey: apiKey ?? "",
      apiUrl,
    });
  }

  return crwApp;
};
