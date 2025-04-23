import FirecrawlApp from "@mendable/firecrawl-js";

const { FIRECRAWL_API_KEY } = process.env;

if (!FIRECRAWL_API_KEY) {
  throw new Error("Missing FIRECRAWL_API_KEY");
}

export const firecrawlApp = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });
