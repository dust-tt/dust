import FirecrawlApp from "@mendable/firecrawl-js";

import { apiConfig } from "@connectors/lib/api/config";

let firecrawlApp: FirecrawlApp;

export const getFirecrawl = () => {
  if (!firecrawlApp) {
    firecrawlApp = new FirecrawlApp({
      apiKey: apiConfig.getFirecrawlAPIConfig().apiKey,
    });
  }

  return firecrawlApp;
};
