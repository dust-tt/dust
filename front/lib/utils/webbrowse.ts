import type {
  ErrorResponse,
  ScrapeParams,
  ScrapeResponse,
} from "@mendable/firecrawl-js";
import { FirecrawlError } from "@mendable/firecrawl-js";
import FirecrawlApp from "@mendable/firecrawl-js";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { dustManagedCredentials, errorToString } from "@app/types";

const credentials = dustManagedCredentials();

// Firecrawl scrape options we use locally: require formats only
type ScrapeOptionsMinimal = Required<Pick<ScrapeParams, "formats">>;

type BrowserScrapeMetadata = {
  status: number;
  url: string;
};

export type BrowseScrapeSuccessResponse = BrowserScrapeMetadata & {
  markdown?: string;
  html?: string;
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
  return "markdown" in response || "html" in response;
}

/**
 * Fetches the content of a URL and returns it as markdown, HTML, or extracted data using Firecrawl
 */
export const browseUrl = async (
  url: string,
  format: "markdown" | "html" = "markdown",
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

  let scrapeResult: ScrapeResponse | ErrorResponse;
  try {
    const formats: ScrapeOptionsMinimal["formats"] = [];

    if (format === "html") {
      formats.push("rawHtml");
    } else {
      formats.push("markdown");
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

    const scrapeOptions: ScrapeOptionsMinimal = { formats };

    scrapeResult = await fc.scrapeUrl(url, scrapeOptions);
  } catch (error) {
    if (isUnsupportedWebsiteError(error)) {
      logger.warn(
        {
          error,
          url: url,
        },
        "[Firecrawl] Unsupported website (probably social media)"
      );

      return {
        error:
          "Website couldn't be crawled, it is no longer supported by Firecrawl.",
        status: 403,
        url: url,
      };
    }

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
      },
      "[Firecrawl] Scrape request failed"
    );
    return {
      error: errorMessage,
      status: 500,
      url: url,
    };
  }

  let actionsScreenshots: string[] | undefined = undefined;
  if (
    scrapeResult.actions &&
    typeof scrapeResult.actions === "object" &&
    "screenshots" in (scrapeResult.actions as Record<string, unknown>)
  ) {
    const v = (scrapeResult.actions as { screenshots?: unknown }).screenshots;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      actionsScreenshots = v as string[];
    }
  }

  if (format === "html" && scrapeResult.rawHtml) {
    const screenshots: string[] = [];
    if (typeof scrapeResult.screenshot === "string") {
      screenshots.push(scrapeResult.screenshot);
    }
    if (Array.isArray(actionsScreenshots)) {
      screenshots.push(...actionsScreenshots);
    }
    return {
      html: scrapeResult.rawHtml,
      screenshots: screenshots.length ? screenshots : undefined,
      links: scrapeResult.links,
      title: scrapeResult.metadata?.title,
      description: scrapeResult.metadata?.description,
      status: scrapeResult.metadata?.statusCode ?? 200,
      url: url,
    };
  } else if (format === "markdown" && scrapeResult.markdown) {
    const screenshots: string[] = [];
    if (typeof scrapeResult.screenshot === "string") {
      screenshots.push(scrapeResult.screenshot);
    }
    if (Array.isArray(actionsScreenshots)) {
      screenshots.push(...actionsScreenshots);
    }
    return {
      markdown: scrapeResult.markdown,
      screenshots: screenshots.length ? screenshots : undefined,
      links: scrapeResult.links,
      title: scrapeResult.metadata?.title,
      description: scrapeResult.metadata?.description,
      status: scrapeResult.metadata?.statusCode ?? 200,
      url: url,
    };
  }

  // If no primary format matched, but we asked for screenshots, still return them if present
  if (options?.screenshotMode && options.screenshotMode !== "none") {
    const screenshots: string[] = [];
    if (typeof scrapeResult.screenshot === "string") {
      screenshots.push(scrapeResult.screenshot);
    }
    if (Array.isArray(actionsScreenshots)) {
      screenshots.push(...actionsScreenshots);
    }
    if (screenshots.length) {
      return {
        screenshots,
        title: scrapeResult.metadata?.title,
        description: scrapeResult.metadata?.description,
        status: scrapeResult.metadata?.statusCode ?? 200,
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
  format: "markdown" | "html" = "markdown",
  options?: {
    screenshotMode?: "none" | "viewport" | "fullPage";
    links?: boolean;
  }
): Promise<Array<BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse>> => {
  const results = await concurrentExecutor(
    urls,
    async (url) => {
      return browseUrl(url, format, options);
    },
    { concurrency: chunkSize }
  );

  return results;
};

const isUnsupportedWebsiteError = (error: unknown): boolean => {
  return (
    error instanceof FirecrawlError &&
    error.statusCode === 403 &&
    error.message.includes("This website is no longer supported")
  );
};
