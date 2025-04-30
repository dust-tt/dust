import type { ScrapeResponse } from "@mendable/firecrawl-js";
import FirecrawlApp from "@mendable/firecrawl-js";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { dustManagedCredentials, errorToString } from "@app/types";

const credentials = dustManagedCredentials();

type BrowserScrapeMetadata = {
  status: number;
  url: string;
};

export type BrowseScrapeSuccessResponse = BrowserScrapeMetadata & {
  markdown: string;
  title: string | undefined;
  description: string | undefined;
};

export type BrowseScrapeErrorResponse = BrowserScrapeMetadata & {
  error: string;
};

export function isBrowseScrapeSuccessResponse(
  response: BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse
): response is BrowseScrapeSuccessResponse {
  return "markdown" in response;
}

/**
 * Fetches the content of a URL and returns it as markdown using Firecrawl
 */
export const browseUrl = async (
  url: string
): Promise<BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse> => {
  if (!credentials.FIRECRAWL_API_KEY) {
    throw new Error(
      "util/webbrowse: a DUST_MANAGED_FIRECRAWL_API_KEY is required"
    );
  }

  const fc = new FirecrawlApp({
    apiKey: credentials.FIRECRAWL_API_KEY,
  });

  let scrapeResult: ScrapeResponse;
  try {
    scrapeResult = (await fc.scrapeUrl(url, {
      formats: ["markdown"],
    })) as ScrapeResponse;
  } catch (error) {
    logger.error(
      {
        error,
        url: url,
      },
      "[Firecrawl] Error scraping URL"
    );
    return {
      error: `Unexpected error: ${errorToString(error)}`,
      status: 500,
      url: url,
    };
  }

  if (!scrapeResult.success) {
    const errorMessage = scrapeResult.error || "Unknown error.";
    return {
      error: errorMessage,
      status: scrapeResult.metadata?.statusCode || 500,
      url: url,
    };
  }

  if (scrapeResult.markdown) {
    return {
      markdown: scrapeResult.markdown,
      title: scrapeResult.metadata?.title,
      description: scrapeResult.metadata?.description,
      status: scrapeResult.metadata?.statusCode ?? 200,
      url: url,
    };
  }

  return {
    error: "Unknown error: No content found in the response",
    status: scrapeResult.metadata?.statusCode ?? 500,
    url: url,
  };
};

/**
 * Processes multiple URLs concurrently in chunks
 */
export const browseUrls = async (
  urls: string[],
  chunkSize = 8
): Promise<Array<BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse>> => {
  const results = await concurrentExecutor(
    urls,
    async (url) => {
      return browseUrl(url);
    },
    { concurrency: chunkSize }
  );

  return results;
};
