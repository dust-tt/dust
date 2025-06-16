import FirecrawlApp from "@mendable/firecrawl-js";
import { Context } from "@temporalio/activity";
import { executeChild } from "@temporalio/workflow";
import { createHash } from "crypto";
import { Op } from "sequelize";

import {
  shouldCrawlLink,
  upsertDocumentsAndPages,
  verifyRedirect,
} from "@connectors/connectors/webcrawler/lib/utils";
import {
  FIRECRAWL_REQ_TIMEOUT,
  MAX_BLOCKED_RATIO,
  MAX_PAGES_TOO_LARGE_RATIO,
  MIN_EXTRACTED_TEXT_LENGTH,
} from "@connectors/connectors/webcrawler/temporal/workflows";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import { redisClient } from "@connectors/lib/redis";
import {
  reportInitialSyncProgress,
  syncFailed,
  syncStarted,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { concurrentExecutor, WEBCRAWLER_MAX_PAGES } from "@connectors/types";

let firecrawl: FirecrawlApp | null = null;
function getFirecrawl() {
  if (!firecrawl) {
    firecrawl = new FirecrawlApp({
      apiKey: apiConfig.getFirecrawlAPIConfig().apiKey,
    });
  }

  return firecrawl;
}

export async function markAsCrawled(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found");
    return;
  }

  const webCrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connectorId);

  if (!webCrawlerConfig) {
    throw new Error(`Webcrawler configuration not found for connector.`);
  }

  // Immediately marking the config as crawled to avoid having the scheduler seeing it as a candidate for crawling
  // in case of the crawling takes too long or fails.
  await webCrawlerConfig.markedAsCrawled();
}

export async function crawlWebsiteByConnectorId(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found");
    return;
  }

  // The crawler scheduler may have scheduled a crawl before the connector was paused.
  if (connector.isPaused()) {
    logger.info({ connectorId }, "Connector is paused. Skipping crawl.");
    return;
  }

  const webCrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connectorId);

  if (!webCrawlerConfig) {
    throw new Error(`Webcrawler configuration not found for connector.`);
  }

  const childLogger = logger.child({
    connectorId: connector.id,
  });

  // Immediately marking the config as crawled to avoid having the scheduler seeing it as a candidate for crawling
  // in case of the crawling takes too long or fails.
  await webCrawlerConfig.markedAsCrawled();

  const redis = await redisClient({ origin: "webcrawler_sync" });
  // Clean keys related to that crawl before starting
  await redis.del(`webcrawler:${webCrawlerConfig.id}*`);

  await syncStarted(connectorId);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const headers = webCrawlerConfig.getCustomHeaders();

  const pageCount = {
    valid: 0,
    tooLarge: 0,
    blocked: 0,
    total() {
      return this.valid + this.tooLarge + this.blocked;
    },
  };

  const maxRequestsPerCrawl =
    webCrawlerConfig.maxPageToCrawl || WEBCRAWLER_MAX_PAGES;

  let rootUrl = webCrawlerConfig.url.trim();
  if (!rootUrl.startsWith("http://") && !rootUrl.startsWith("https://")) {
    rootUrl = `http://${rootUrl}`;
  }

  childLogger.info(
    {
      url: rootUrl,
      configId: webCrawlerConfig.id,
    },
    "Webcrawler activity started"
  );

  let urlsToScrape: string[] = [rootUrl];

  const stats = {
    totalExtracted: 0,
    upsertingError: 0,
    requestsFinished: 0,
  };

  do {
    const urls = await concurrentExecutor(
      urlsToScrape,
      (url) =>
        executeChild(scrapeUrl, {
          workflowId: `webcrawler-${connectorId}-scrape-url-${createHash("md5").update(url).digest("hex")}`,
          searchAttributes: {
            connectorId: [connectorId],
            url: [url],
          },
          args: [
            {
              url,
              connectorId,
              currentRequestDepth: 0,
              dataSourceConfig,
              webCrawlerConfig: {
                id: webCrawlerConfig.id,
                depth: webCrawlerConfig.depth,
                url: webCrawlerConfig.url,
                crawlMode: webCrawlerConfig.crawlMode,
              },
              headers,
            },
          ],
        }),
      { concurrency: 50 }
    );

    // Reset the next urls.
    urlsToScrape = [];

    // Get next urls and count errors.
    for (const url of urls) {
      stats.requestsFinished++;
      stats.totalExtracted += url.extracted;

      if (url.error !== null) {
        switch (url.error) {
          case "too_large":
            pageCount.tooLarge++;
            break;
          case "upsert":
            stats.upsertingError++;
            break;
        }
      } else {
        pageCount.valid++;
        urlsToScrape.push(...url.nextUrls);
      }
    }

    await reportInitialSyncProgress(connectorId, `${pageCount.valid} pages`);
  } while (urlsToScrape.length > 0);

  // Clean keys related to that crawl after.
  await redis.del(`webcrawler:${webCrawlerConfig.id}*`);

  if (pageCount.blocked / pageCount.total() > MAX_BLOCKED_RATIO) {
    await syncFailed(connector.id, "webcrawling_error_blocked");
  } else if (
    pageCount.tooLarge / pageCount.total() >
    MAX_PAGES_TOO_LARGE_RATIO
  ) {
    await syncFailed(connector.id, "webcrawling_error_content_too_large");
  } else if (stats.totalExtracted < MIN_EXTRACTED_TEXT_LENGTH) {
    await syncFailed(connector.id, "webcrawling_error_empty_content");
  } else if (pageCount.valid === 0) {
    await syncFailed(connector.id, "webcrawling_error");
  } else if (stats.requestsFinished >= maxRequestsPerCrawl) {
    await syncFailed(connector.id, "webcrawling_synchronization_limit_reached");
  } else {
    await syncSucceeded(connector.id);
  }

  if (stats.upsertingError > 0) {
    throw new Error(
      `Webcrawler failed while upserting documents to Dust. Error count: ${stats.upsertingError}`
    );
  }

  childLogger.info(
    {
      url: rootUrl,
      pageCount: pageCount.valid,
      configId: webCrawlerConfig.id,
    },
    "Webcrawler activity finished"
  );

  return {
    pageCount: pageCount.valid,
  };
}

export async function webCrawlerGarbageCollector(
  connectorId: ModelId,
  lastSyncStartTsMs: number
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found");
    return;
  }

  const webCrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connectorId);
  if (!webCrawlerConfig) {
    throw new Error(`Webcrawler configuration not found for connector.`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  let pagesToDelete: WebCrawlerPage[] = [];
  do {
    pagesToDelete = await WebCrawlerPage.findAll({
      where: {
        connectorId,
        webcrawlerConfigurationId: webCrawlerConfig.id,
        lastSeenAt: {
          [Op.lt]: new Date(lastSyncStartTsMs),
        },
      },
      limit: 100,
    });
    for (const page of pagesToDelete) {
      Context.current().heartbeat({
        type: "delete_page",
      });
      await deleteDataSourceDocument(dataSourceConfig, page.documentId);
      await page.destroy();
    }
  } while (pagesToDelete.length > 0);

  let foldersToDelete: WebCrawlerFolder[] = [];
  do {
    foldersToDelete = await WebCrawlerFolder.findAll({
      where: {
        connectorId,
        webcrawlerConfigurationId: webCrawlerConfig.id,
        lastSeenAt: {
          [Op.lt]: new Date(lastSyncStartTsMs),
        },
      },
      limit: 100,
    });
    Context.current().heartbeat({
      type: "delete_folder",
    });
    for (const folder of foldersToDelete) {
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: folder.internalId,
      });
      await folder.destroy();
    }
  } while (foldersToDelete.length > 0);
}

export async function getConnectorIdsForWebsitesToCrawl() {
  return WebCrawlerConfigurationResource.getConnectorIdsForWebsitesToCrawl();
}

export async function scrapeUrl({
  url,
  connectorId,
  currentRequestDepth,
  webCrawlerConfig,
  dataSourceConfig,
  headers,
}: {
  url: string;
  connectorId: ModelId;
  currentRequestDepth: number;
  webCrawlerConfig: Pick<
    WebCrawlerConfigurationResource,
    "id" | "depth" | "url" | "crawlMode"
  >;
  headers: Record<string, string>;
  dataSourceConfig: DataSourceConfig;
}) {
  const childLogger = logger.child({
    connectorId,
  });

  const firecrawlApp = getFirecrawl();
  if (firecrawlApp === null) {
    throw new Error("Couldn't getFirecrawl");
  }

  const checkUrl = await verifyRedirect(url);
  if (checkUrl.isErr()) {
    childLogger.error(
      {
        type: checkUrl.error.type,
        configId: webCrawlerConfig.id,
        sourceUrl: url,
      },
      checkUrl.error.message
    );
    return { nextUrls: [], extracted: 0, error: null };
  }

  if (
    checkUrl.value !== url &&
    !shouldCrawlLink(
      checkUrl.value.toString(),
      webCrawlerConfig,
      currentRequestDepth
    )
  ) {
    childLogger.warn(
      { sourceUrl: url, url: checkUrl.value },
      "Should not crawl"
    );
    return { nextUrls: [], extracted: 0, error: null };
  }

  const crawlerResponse = await firecrawlApp.scrapeUrl(url, {
    onlyMainContent: true,
    formats: ["markdown", "links"],
    headers,
    timeout: FIRECRAWL_REQ_TIMEOUT,
  });
  if (!crawlerResponse.success) {
    childLogger.error(
      { url, configId: webCrawlerConfig.id },
      `Error scraping: ${crawlerResponse.error}`
    );

    throw new Error(crawlerResponse.error);
  }

  childLogger.debug(
    {
      url,
      configId: webCrawlerConfig.id,
      links: crawlerResponse.links,
    },
    "Receive response"
  );

  const upsertResponse = await upsertDocumentsAndPages({
    url,
    connectorId,
    webCrawlerConfigId: webCrawlerConfig.id,
    crawlerResponse,
    dataSourceConfig,
    currentRequestDepth,
  });

  return {
    nextUrls:
      crawlerResponse.links?.filter((link) =>
        shouldCrawlLink(link, webCrawlerConfig, currentRequestDepth)
      ) ?? [],
    error: upsertResponse.isErr() ? upsertResponse.error : null,
    extracted: upsertResponse.isOk() ? upsertResponse.value.extracted : 0,
  };
}
