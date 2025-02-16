const SerpApi = require("google-search-results-nodejs");
import { SERPAPI_API_KEY, SERPAPI_DEFAULT_ENGINE } from "../config";

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  cached_page_link?: string;
  related_pages_link?: string;
  source?: string;
  date?: string;
}

export interface SearchOptions {
  // Search engine options
  engine?: "google" | "google_news" | "google_images";
  device?: "desktop" | "mobile" | "tablet";

  // Result options
  num?: number;
  start?: number;

  // Location options
  location?: string;
  uule?: string; // Google encoded location

  // Language and safety
  language?: string;
  safe?: "active" | "off";

  // Advanced options
  no_cache?: boolean;
  async?: boolean;
  zero_trace?: boolean;

  // Output format
  output?: "json" | "html";
}

export interface ImageResult {
  title: string;
  link: string;
  source: string;
  thumbnail: string;
  original: string;
  position: number;
  is_product?: boolean;
  price?: string;
  source_name?: string;
}

export class SerpService {
  private searchClient: any;

  constructor() {
    if (!SERPAPI_API_KEY) {
      throw new Error("SerpAPI key is required");
    }
    this.searchClient = new SerpApi.GoogleSearch(SERPAPI_API_KEY);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    const maxRetries = 3;
    const initialDelay = 1000; // 1 second
    const backoffFactor = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          console.error(
            `Failed ${context} after ${maxRetries} attempts:`,
            error
          );
          throw error;
        }

        const delay = initialDelay * Math.pow(backoffFactor, attempt - 1);
        console.log(
          `${context} attempt ${attempt} failed, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed ${context} after all retries`);
  }

  private getSearchParams(query: string, options: SearchOptions = {}) {
    return {
      q: query,
      engine: options.engine || SERPAPI_DEFAULT_ENGINE,
      device: options.device || "desktop",
      num: options.num || 10,
      start: options.start,
      location: options.location,
      uule: options.uule,
      hl: options.language,
      safe: options.safe || "active",
      no_cache: options.no_cache,
      async: options.async,
      zero_trace: options.zero_trace,
      output: options.output || "json",
    };
  }

  async searchWeb(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      return await this.withRetry(
        () =>
          new Promise((resolve, reject) => {
            this.searchClient.json(
              this.getSearchParams(query, options),
              (data: any) => {
                if (data.error) {
                  reject(new Error(data.error));
                  return;
                }

                const results =
                  data.organic_results?.map((result: any, index: number) => ({
                    title: result.title,
                    link: result.link,
                    snippet: result.snippet,
                    position: index + 1,
                    cached_page_link: result.cached_page_link,
                    related_pages_link: result.related_pages_link,
                    source: result.source,
                    date: result.date,
                  })) || [];

                resolve(results);
              }
            );
          }),
        "searching web"
      );
    } catch (error) {
      console.error("Error searching web:", { error, query });
      throw error;
    }
  }
}
