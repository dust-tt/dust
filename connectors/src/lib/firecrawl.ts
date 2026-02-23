import { apiConfig } from "@connectors/lib/api/config";
import FirecrawlApp from "@mendable/firecrawl-js";

let firecrawlApp: FirecrawlApp;

export const getFirecrawl = () => {
  if (!firecrawlApp) {
    firecrawlApp = new FirecrawlApp({
      apiKey: apiConfig.getFirecrawlAPIConfig().apiKey,
    });
  }

  return firecrawlApp;
};
