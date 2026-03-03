import { clientFetch } from "@app/lib/egress/client";
import { untrustedFetch } from "@app/lib/egress/server";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { errorToString } from "@app/types/shared/utils/error_utils";
import type {
  ErrorResponse,
  ScrapeParams,
  ScrapeResponse,
} from "@mendable/firecrawl-js";
import FirecrawlApp, { FirecrawlError } from "@mendable/firecrawl-js";

const credentials = dustManagedCredentials();

const SPIDER_API_BASE_URL = "https://api.spider.cloud";

const TEXT_CONTENT_TYPES = [
  "text/",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/ld+json",
];

/**
 * Checks if a content type represents binary (non-text) content
 */
const isBinaryContent = (contentType: string | null): boolean => {
  if (!contentType) {
    return false;
  }

  return !TEXT_CONTENT_TYPES.some((type) => {
    return contentType.toLowerCase().startsWith(type);
  });
};

const HEAD_FETCH_TIMEOUT_MS = 5000;

/**
 * Makes a HEAD request to check if the URL points to binary content
 * Returns null if the check fails (to allow proceeding with scraping)
 */
const checkForBinaryContent = async (
  url: string
): Promise<{
  isBinary: boolean;
  contentType: string | null;
  status: number;
} | null> => {
  try {
    const response = await untrustedFetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(HEAD_FETCH_TIMEOUT_MS),
    });

    const contentType = response.headers.get("content-type");
    return {
      isBinary: isBinaryContent(contentType),
      contentType,
      status: response.status,
    };
  } catch (error) {
    logger.warn(
      { error, url },
      "Failed to check for binary content with HEAD request"
    );
    // Return null to allow proceeding with scraping if HEAD request fails
    return null;
  }
};

// Firecrawl scrape options we use locally: require formats only
type ScrapeOptionsMinimal = Required<Pick<ScrapeParams, "formats">>;

type BrowserScrapeMetadata = {
  status: number;
  url: string;
};

type BrowseScrapeSuccessResponse = BrowserScrapeMetadata & {
  markdown?: string;
  html?: string;
  screenshots?: string[];
  links?: string[];
  title: string | undefined;
  description: string | undefined;
};

type BrowseScrapeErrorResponse = BrowserScrapeMetadata & {
  error: string;
};

export function isBrowseScrapeSuccessResponse(
  response: BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse
): response is BrowseScrapeSuccessResponse {
  return "markdown" in response || "html" in response;
}

type SpiderScrapeResultMetadata = {
  title?: string;
  description?: string;
  status?: number;
};

type SpiderScrapeResult = {
  url?: string;
  status?: number;
  content?: string;
  error?: string | null;
  metadata?: SpiderScrapeResultMetadata | null;
  links?: string[] | null;
  page_links?: string[] | null;
};

type SpiderScrapeResponse = SpiderScrapeResult | SpiderScrapeResult[];

const normalizeSpiderScrapeResult = (
  json: SpiderScrapeResponse
): SpiderScrapeResult | null => {
  if (Array.isArray(json)) {
    if (json.length === 0) {
      return null;
    }
    return json[0] ?? null;
  }
  return json;
};

/**
 * Fetches the content of a URL and returns it as markdown, HTML, or extracted data using Firecrawl
 */
const browseUrlFirecrawl = async (
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

  // Check if the URL points to binary content before attempting to scrape
  const binaryCheck = await checkForBinaryContent(url);
  if (!binaryCheck) {
    return {
      error: `[Firecrawl] Unable to check url's content type before scraping, skipping.`,
      status: 500,
      url,
    };
  }
  if (binaryCheck.isBinary) {
    logger.info(
      {
        url,
        binaryCheck,
      },
      "[Firecrawl] Skipping binary content"
    );

    return {
      error: `[Firecrawl] Binary content detected (Content-Type: ${binaryCheck.contentType}). Cannot scrape non-text content.`,
      status: binaryCheck.status,
      url,
    };
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
 * Spider-based alternative to browse a single URL.
 *
 * This uses Spider's /scrape endpoint and maps its response to the
 * same BrowseScrape*Response types used by the Firecrawl implementation.
 *
 * NOTE: Screenshot capture is currently not implemented for Spider and
 * screenshotMode is ignored.
 */
const browseUrlSpider = async (
  url: string,
  format: "markdown" | "html" = "markdown",
  options?: {
    // Currently ignored for Spider; kept for signature parity.
    screenshotMode?: "none" | "viewport" | "fullPage";
    links?: boolean;
  }
): Promise<BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse> => {
  if (!credentials.SPIDER_API_KEY) {
    throw new Error(
      "util/webbrowse: a DUST_MANAGED_SPIDER_API_KEY is required"
    );
  }

  const returnFormat = format === "html" ? "raw" : "markdown";

  let res: Response;
  try {
    res = await clientFetch(`${SPIDER_API_BASE_URL}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.SPIDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        return_format: returnFormat,
        request: "smart",
        metadata: true,
        return_page_links: options?.links ?? false,
      }),
    });
  } catch (error) {
    logger.error(
      {
        error,
        url,
      },
      "[Spider] Network or fetch error while scraping URL"
    );

    return {
      error: `Unexpected network error: ${errorToString(error)}`,
      status: 500,
      url,
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (error) {
    logger.error(
      {
        error,
        url,
        status: res.status,
      },
      "[Spider] Failed to parse JSON response"
    );
    return {
      error: `Failed to parse Spider response: ${errorToString(error)}`,
      status: res.status || 500,
      url,
    };
  }

  const normalized = normalizeSpiderScrapeResult(json as SpiderScrapeResponse);

  if (!normalized) {
    logger.error(
      {
        url,
        status: res.status,
      },
      "[Spider] Empty scrape response"
    );
    return {
      error: "Unknown error: Empty response from Spider",
      status: res.status || 500,
      url,
    };
  }

  const { content, error, status, metadata, links, page_links } = normalized;

  const effectiveStatus = status ?? metadata?.status ?? res.status;

  if (error) {
    logger.error(
      {
        url,
        status: effectiveStatus,
        error,
      },
      "[Spider] Scrape request failed"
    );
    return {
      error,
      status: effectiveStatus || 500,
      url,
    };
  }

  if (!content) {
    logger.error(
      {
        url,
        status: effectiveStatus,
      },
      "[Spider] No content field in scrape response"
    );
    return {
      error: "Unknown error: No content found in the Spider response",
      status: effectiveStatus || 500,
      url,
    };
  }

  const outLinks =
    Array.isArray(links) && links.length > 0
      ? links
      : Array.isArray(page_links) && page_links.length > 0
        ? page_links
        : undefined;

  if (format === "html") {
    return {
      html: content,
      links: outLinks,
      title: metadata?.title,
      description: metadata?.description,
      status: effectiveStatus || 200,
      url,
    };
  }

  return {
    markdown: content,
    links: outLinks,
    title: metadata?.title,
    description: metadata?.description,
    status: effectiveStatus || 200,
    url,
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
    provider?: "firecrawl" | "spider";
  }
): Promise<Array<BrowseScrapeSuccessResponse | BrowseScrapeErrorResponse>> => {
  const provider = options?.provider ?? "firecrawl";

  logger.info(
    { count: urls.length, urls, provider },
    "Starting to browse URLs"
  );
  const startTime = Date.now();
  const results = await concurrentExecutor(
    urls,
    async (url) => {
      logger.info({ url, provider }, "Browsing URL");
      if (provider === "spider") {
        return browseUrlSpider(url, format, options);
      }
      return browseUrlFirecrawl(url, format, options);
    },
    { concurrency: chunkSize }
  );
  logger.info(
    { urls, format, options, provider, duration: Date.now() - startTime },
    "Browsed URLs"
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
