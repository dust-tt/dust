import FirecrawlApp from "@mendable/firecrawl-js";

import { apiConfig } from "./api/config";

export const firecrawlApp = new FirecrawlApp({
  apiKey: apiConfig.getFirecrawlAPIConfig().apiKey,
});
