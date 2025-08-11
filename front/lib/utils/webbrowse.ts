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
  markdown?: string;
  html?: string;
  extract?: unknown;
  screenshots?: string[];
  links?: string[];
  title: string | undefined;
  description: string | undefined;
};

export type BrowseScrapeErrorResponse = BrowserScrapeMetadata & {
  error: string;
};

export function isBrowseScrapeSuccessResponse(
  response: BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse
): response is BrowseScrapeSuccessResponse {
  return "markdown" in response || "html" in response || "extract" in response;
}

/**
 * Fetches the content of a URL and returns it as markdown, HTML, or extracted data using Firecrawl
 */
export const browseUrl = async (
  url: string,
  format: "markdown" | "html" | "extract" = "markdown",
  extractPrompt?: string,
  options?: {
    screenshotMode?: "none" | "viewport" | "fullPage";
    links?: boolean;
  }
): Promise<BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse> => {
  if (!credentials.FIRECRAWL_API_KEY) {
    throw new Error(
      "util/webbrowse: a DUST_MANAGED_FIRECRAWL_API_KEY is required"
    );
  }

  const fc = new FirecrawlApp({
    apiKey: credentials.FIRECRAWL_API_KEY,
  });

  type FirecrawlFormat =
    | "markdown"
    | "rawHtml"
    | "links"
    | "screenshot"
    | "screenshot@fullPage"
    | "extract";

  interface ScrapeOptionsMinimal {
    formats?: FirecrawlFormat[];
    extract?: { prompt: string };
  }

  type ExtendedScrapeResponse = ScrapeResponse & {
    markdown?: string;
    rawHtml?: string;
    extract?: unknown;
    screenshot?: string;
    links?: string[];
    metadata?: { statusCode?: number; title?: string; description?: string };
    actions?: unknown;
    error?: string;
    success?: boolean;
  };

  let scrapeResult: ScrapeResponse;
  try {
    const scrapeOptions: ScrapeOptionsMinimal = {};
    const formats: FirecrawlFormat[] = [];

    if (format === "extract") {
      if (!extractPrompt) {
        return {
          error:
            "When format is 'extract', provide extractPrompt (natural language).",
          status: 400,
          url: url,
        };
      }
      formats.push("extract");
      scrapeOptions.extract = { prompt: extractPrompt };
    } else {
      if (format === "html") {
        formats.push("rawHtml");
      } else {
        formats.push("markdown");
      }
    }

    if (options?.screenshotMode && options.screenshotMode !== "none") {
      // Firecrawl requires choosing exactly one screenshot format
      if (options.screenshotMode === "fullPage") {
        formats.push("screenshot@fullPage");
      } else {
        formats.push("screenshot");
      }
    }

    if (options?.links) {
      formats.push("links");
    }

    scrapeOptions.formats = formats;

    scrapeResult = (await fc.scrapeUrl(url, scrapeOptions)) as ScrapeResponse;
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
    logger.error(
      {
        url,
        format,
        error: errorMessage,
        metadata: scrapeResult.metadata,
      },
      "[Firecrawl] Scrape request failed"
    );
    return {
      error: errorMessage,
      status: scrapeResult.metadata?.statusCode || 500,
      url: url,
    };
  }

  const extended = scrapeResult as ExtendedScrapeResponse;
  let actionsScreenshots: string[] | undefined = undefined;
  if (
    extended.actions &&
    typeof extended.actions === "object" &&
    "screenshots" in (extended.actions as Record<string, unknown>)
  ) {
    const v = (extended.actions as { screenshots?: unknown }).screenshots;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      actionsScreenshots = v as string[];
    }
  }

  if (
    format === "extract" &&
    (scrapeResult as ExtendedScrapeResponse).extract
  ) {
    const sr = scrapeResult as ExtendedScrapeResponse;
    const screenshots: string[] = [];
    if (typeof sr.screenshot === "string") {
      screenshots.push(sr.screenshot);
    }
    if (Array.isArray(actionsScreenshots)) {
      screenshots.push(...actionsScreenshots);
    }
    return {
      extract: sr.extract,
      screenshots: screenshots.length ? screenshots : undefined,
      links: sr.links,
      title: sr.metadata?.title,
      description: sr.metadata?.description,
      status: sr.metadata?.statusCode ?? 200,
      url: url,
    };
  } else if (format === "extract" && !scrapeResult.extract) {
    logger.error(
      {
        url,
        scrapeResult: JSON.stringify(scrapeResult),
      },
      "[Firecrawl] Extract format requested but no extract data returned"
    );
    return {
      error:
        "Extract format requested but no extract data was returned from Firecrawl",
      status: scrapeResult.metadata?.statusCode ?? 500,
      url: url,
    };
  } else if (
    format === "html" &&
    (scrapeResult as ExtendedScrapeResponse).rawHtml
  ) {
    const sr = scrapeResult as ExtendedScrapeResponse;
    const screenshots: string[] = [];
    if (typeof sr.screenshot === "string") {
      screenshots.push(sr.screenshot);
    }
    if (Array.isArray(actionsScreenshots)) {
      screenshots.push(...actionsScreenshots);
    }
    return {
      html: sr.rawHtml,
      screenshots: screenshots.length ? screenshots : undefined,
      links: sr.links,
      title: sr.metadata?.title,
      description: sr.metadata?.description,
      status: sr.metadata?.statusCode ?? 200,
      url: url,
    };
  } else if (format === "markdown" && scrapeResult.markdown) {
    const sr = scrapeResult as ExtendedScrapeResponse;
    const screenshots: string[] = [];
    if (typeof sr.screenshot === "string") {
      screenshots.push(sr.screenshot);
    }
    if (Array.isArray(actionsScreenshots)) {
      screenshots.push(...actionsScreenshots);
    }
    return {
      markdown: sr.markdown,
      screenshots: screenshots.length ? screenshots : undefined,
      links: sr.links,
      title: sr.metadata?.title,
      description: sr.metadata?.description,
      status: sr.metadata?.statusCode ?? 200,
      url: url,
    };
  }

  // If no primary format matched, but we asked for screenshots, still return them if present
  if (options?.screenshotMode && options.screenshotMode !== "none") {
    const sr = scrapeResult as ExtendedScrapeResponse;
    const screenshots: string[] = [];
    if (typeof sr.screenshot === "string") {
      screenshots.push(sr.screenshot);
    }
    if (Array.isArray(actionsScreenshots)) {
      screenshots.push(...actionsScreenshots);
    }
    if (screenshots.length) {
      return {
        screenshots,
        title: sr.metadata?.title,
        description: sr.metadata?.description,
        status: sr.metadata?.statusCode ?? 200,
        url,
      };
    }
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
  chunkSize = 8,
  format: "markdown" | "html" | "extract" = "markdown",
  extractPrompt?: string,
  options?: {
    screenshotMode?: "none" | "viewport" | "fullPage";
    links?: boolean;
  }
): Promise<Array<BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse>> => {
  const results = await concurrentExecutor(
    urls,
    async (url) => {
      return browseUrl(url, format, extractPrompt, options);
    },
    { concurrency: chunkSize }
  );

  return results;
};
