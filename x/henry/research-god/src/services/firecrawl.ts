import FirecrawlApp from "@mendable/firecrawl-js";
import { FIRECRAWL_API_KEY } from "../config";
import type { FirecrawlDocument, ScrapeResponse } from "@mendable/firecrawl-js";

export interface ScrapedContent {
  markdown: string;
  html: string | undefined;
  content: string;
  metadata: {
    title?: string;
    [key: string]: any;
  };
}

export class FirecrawlService {
  private client: FirecrawlApp;

  constructor() {
    if (!FIRECRAWL_API_KEY) {
      throw new Error("Firecrawl API key is required");
    }
    this.client = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });
  }

  async scrapeUrl(url: string): Promise<ScrapedContent> {
    const maxRetries = 3;
    const initialDelay = 1000; // 1 second
    const backoffFactor = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response: ScrapeResponse = await this.client.scrapeUrl(url);

        if (!response.success || !response.data) {
          throw new Error(response.error || "Failed to scrape URL");
        }

        const document: FirecrawlDocument = response.data;
        return {
          markdown: document.markdown || document.content,
          html: document.html,
          content: document.content,
          metadata: document.metadata || {},
        };
      } catch (error) {
        if (attempt === maxRetries) {
          throw error; // If we've exhausted all retries, throw the error
        }

        // Calculate delay with exponential backoff
        const delay = initialDelay * Math.pow(backoffFactor, attempt - 1);
        console.log(
          `Scraping attempt ${attempt} failed, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This should never be reached due to the throw in the last iteration
    throw new Error("Failed to scrape URL after all retries");
  }
}
