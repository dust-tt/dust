import type {
  Action,
  CrawlScrapeOptions,
  FirecrawlDocument,
  ScrapeParams,
} from "@mendable/firecrawl-js";
import type FirecrawlApp from "@mendable/firecrawl-js";
import { FirecrawlError } from "@mendable/firecrawl-js";
import { Context } from "@temporalio/activity";
import { randomUUID } from "crypto";
import path from "path";
import type { Logger } from "pino";
import { Op } from "sequelize";

import {
  getAllFoldersForUrl,
  getDisplayNameForFolder,
  getFolderForUrl,
  getParentsForPage,
  isTopFolder,
  shouldCrawlLink,
  stableIdForUrl,
} from "@connectors/connectors/webcrawler/lib/utils";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  MAX_SMALL_DOCUMENT_TXT_LEN,
  upsertDataSourceDocument,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import { getFirecrawl } from "@connectors/lib/firecrawl";
import {
  WebCrawlerFolderModel,
  WebCrawlerPageModel,
} from "@connectors/lib/models/webcrawler";
import {
  reportInitialSyncProgress,
  syncFailed,
  syncStarted,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";
import type { ModelId } from "@connectors/types";
import {
  INTERNAL_MIME_TYPES,
  normalizeError,
  stripNullBytes,
  validateUrl,
} from "@connectors/types";

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

  // Immediately marking the config as crawled to avoid having the scheduler seeing it as a
  // candidate for crawling in case of the crawling takes too long or fails.
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

  // Immediately marking the config as crawled to avoid having the scheduler seeing it as a
  // candidate for crawling in case of the crawling takes too long or fails.
  await webCrawlerConfig.markedAsCrawled();

  // We mark the crawler as started which will store startedat as lastSyncStartTime. This is what
  // we'll use to run the GC
  const startedAt = new Date();
  await syncStarted(connectorId, startedAt);

  let rootUrl = webCrawlerConfig.url.trim();
  if (!rootUrl.startsWith("http://") && !rootUrl.startsWith("https://")) {
    rootUrl = `http://${rootUrl}`;
  }

  const firecrawlApp = getFirecrawl();

  try {
    if (webCrawlerConfig.sitemapOnly) {
      await startBatchScrapeJob(rootUrl, {
        webCrawlerConfig,
        connector,
        firecrawlApp,
        logger: childLogger,
      });
    } else {
      await startCrawlJob(rootUrl, {
        webCrawlerConfig,
        connector,
        firecrawlApp,
        logger: childLogger,
      });
    }
  } catch (error) {
    // Handle thrown errors from Firecrawl API
    if (error instanceof FirecrawlError) {
      childLogger.error(
        {
          rootUrl,
          connectorId,
          webCrawlerConfigId: webCrawlerConfig.id,
          firecrawlStatusCode: error.statusCode,
          firecrawlError: {
            statusCode: error.statusCode,
            name: error.name,
          },
        },
        `Firecrawl crawler failed: ${error.message}`
      );

      await syncFailed(
        connectorId,
        error.statusCode === 403
          ? "webcrawling_error_blocked"
          : "webcrawling_error"
      );
    } else {
      await syncFailed(connectorId, "webcrawling_error");
      const errorMessage = normalizeError(error).message;
      childLogger.error(
        {
          rootUrl,
          connectorId,
          webCrawlerConfigId: webCrawlerConfig.id,
        },
        `Unhandled crawler error: ${errorMessage}`
      );
    }
  }

  return {
    launchGarbageCollect: false,
    startedAtTs: startedAt.getTime(),
  };
}

function formatDocumentContent({
  title,
  content,
  url,
}: {
  title: string;
  content: string;
  url: string;
}): CoreAPIDataSourceDocumentSection {
  const URL_MAX_LENGTH = 128;
  const TITLE_MAX_LENGTH = 300;

  const parsedUrl = new URL(url);
  const urlWithoutQuery = path.join(parsedUrl.origin, parsedUrl.pathname);

  const sanitizedContent = stripNullBytes(content);
  const sanitizedTitle = stripNullBytes(title);
  const sanitizedUrlWithoutQuery = stripNullBytes(urlWithoutQuery);

  return {
    prefix: `URL: ${sanitizedUrlWithoutQuery.slice(0, URL_MAX_LENGTH)}${
      sanitizedUrlWithoutQuery.length > URL_MAX_LENGTH ? "..." : ""
    }\n`,
    content: `TITLE: ${sanitizedTitle.substring(0, TITLE_MAX_LENGTH)}\n${sanitizedContent}`,
    sections: [],
  };
}

function getFirecrawlScrapeOptions<
  // Need that extra extend so that tsc is happy.
  ActionSchema extends Action[] | undefined = undefined,
>(
  webCrawlerConfig: WebCrawlerConfigurationResource
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ScrapeParams<any, ActionSchema> {
  return {
    onlyMainContent: true,
    formats: ["markdown"],
    headers: webCrawlerConfig.getCustomHeaders(),
    maxAge: 43_200_000, // Use last 12h of cache
    actions: (webCrawlerConfig.actions as ActionSchema) ?? undefined,
  };
}

function getFirecrawlWebhookConfig(connector: ConnectorResource) {
  return {
    url: `${apiConfig.getConnectorsPublicURL()}/webhooks/${apiConfig.getDustConnectorsWebhooksSecret()}/firecrawl`,
    metadata: {
      connectorId: String(connector.id),
    },
  };
}

type FirecrawlJobHelpersParams = {
  webCrawlerConfig: WebCrawlerConfigurationResource;
  connector: ConnectorResource;
  firecrawlApp: FirecrawlApp;
  logger: Logger;
};

async function startCrawlJob(
  url: string,
  {
    webCrawlerConfig,
    connector,
    firecrawlApp,
    logger,
  }: FirecrawlJobHelpersParams
) {
  const maxRequestsPerCrawl = webCrawlerConfig.getMaxPagesToCrawl();

  const crawlerResponse = await firecrawlApp.asyncCrawlUrl(url, {
    maxDiscoveryDepth: webCrawlerConfig.getDepth(),
    limit: maxRequestsPerCrawl,
    crawlEntireDomain: webCrawlerConfig.crawlMode === "website",
    maxConcurrency: 2,
    delay: 3,
    // Ok to `as` for now. API support actions but the SDK doesn't have the types
    // PR: https://github.com/dust-tt/dust/pull/14308
    scrapeOptions: getFirecrawlScrapeOptions(
      webCrawlerConfig
    ) as CrawlScrapeOptions & { actions?: Action[] },
    webhook: getFirecrawlWebhookConfig(connector),
  });
  if (!crawlerResponse.success) {
    logger.error(
      {
        url,
        connectorId: connector.id,
        webCrawlerConfigId: webCrawlerConfig.id,
      },
      `Firecrawl crawl failed: ${crawlerResponse.error}`
    );
    await syncFailed(connector.id, "webcrawling_error");
  } else {
    logger.info(
      { crawlerId: crawlerResponse.id, url, connectorId: connector.id },
      "Firecrawl crawler started"
    );

    if (crawlerResponse.id) {
      await webCrawlerConfig.updateCrawlId(crawlerResponse.id);
    } else {
      // Shouldn't happen, but based on the types, let's make sure
      logger.warn(
        {
          webCrawlerConfigId: webCrawlerConfig.id,
          url,
          connectorId: connector.id,
        },
        "No ID found when creating a Firecrawl crawler"
      );
    }
  }
}

async function startBatchScrapeJob(
  url: string,
  {
    webCrawlerConfig,
    firecrawlApp,
    connector,
    logger,
  }: FirecrawlJobHelpersParams
) {
  // Gets us all urls from the sitemaps
  const mapUrlResult = await firecrawlApp.mapUrl(url, {
    ignoreSitemap: false,
    sitemapOnly: true,
  });

  if (!mapUrlResult.success) {
    logger.error(
      {
        url,
        connectorId: connector.id,
        webCrawlerConfigId: webCrawlerConfig.id,
      },
      `Error mapping rootUrl: ${mapUrlResult.error}`
    );
    return;
  }

  const filteredUrl =
    mapUrlResult.links
      ?.filter((link) => shouldCrawlLink(link, webCrawlerConfig))
      ?.slice(0, webCrawlerConfig.getMaxPagesToCrawl()) ?? [];
  const batchScrapeResponse = await firecrawlApp.asyncBatchScrapeUrls(
    filteredUrl,
    getFirecrawlScrapeOptions(webCrawlerConfig),
    undefined, // idempotency key
    getFirecrawlWebhookConfig(connector),
    true // ignoreInvalidURLs
  );

  if (!batchScrapeResponse.success) {
    logger.error(
      {
        url,
        connectorId: connector.id,
        webCrawlerConfigId: webCrawlerConfig.id,
      },
      `Firecrawl batch scrape failed: ${batchScrapeResponse.error}`
    );
    await syncFailed(connector.id, "webcrawling_error");
  } else {
    logger.info(
      { jobId: batchScrapeResponse.id, url, connectorId: connector.id },
      "Firecrawl crawler started"
    );

    if (batchScrapeResponse.id) {
      await webCrawlerConfig.updateCrawlId(batchScrapeResponse.id);
    } else {
      // Shouldn't happen, but based on the types, let's make sure
      logger.warn(
        {
          webCrawlerConfigId: webCrawlerConfig.id,
          url,
          connectorId: connector.id,
        },
        "No ID found when creating a Firecrawl crawler"
      );
    }
  }
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
  let pagesToDelete: WebCrawlerPageModel[] = [];
  do {
    pagesToDelete = await WebCrawlerPageModel.findAll({
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
      await deleteDataSourceDocument(dataSourceConfig, page.documentId, {
        connectorId,
      });
      await page.destroy();
    }
  } while (pagesToDelete.length > 0);

  let foldersToDelete: WebCrawlerFolderModel[] = [];
  do {
    foldersToDelete = await WebCrawlerFolderModel.findAll({
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
        loggerArgs: { connectorId },
      });
      await folder.destroy();
    }
  } while (foldersToDelete.length > 0);
}

export async function getConnectorIdsForWebsitesToCrawl() {
  return WebCrawlerConfigurationResource.getConnectorIdsForWebsitesToCrawl();
}

export async function firecrawlCrawlFailed(
  connectorId: ModelId,
  crawlId: string
) {
  const localLogger = logger.child({
    connectorId,
    crawlId,
  });

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    localLogger.error({ connectorId }, "Connector not found");
    return;
  }

  const webConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connectorId);
  if (!webConfig) {
    localLogger.error({ connectorId }, "WebCrawlerConfiguration not found");
    return;
  }

  await webConfig.updateCrawlId(null);

  // Mark the web crawler as failed.
  await syncFailed(connector.id, "webcrawling_error");
}

export async function firecrawlCrawlStarted(
  connectorId: ModelId,
  crawlId: string
) {
  const localLogger = logger.child({
    connectorId,
    crawlId,
  });

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    localLogger.error({ connectorId }, "Connector not found");
    return;
  }

  // Mark the webcrawler sync as started.
  await syncStarted(connector.id);
}

export async function firecrawlCrawlPage(
  connectorId: ModelId,
  crawlId: string,
  scrapeId: string
) {
  const localLogger = logger.child({
    connectorId,
    crawlId,
    scrapeId,
  });

  const connector = await ConnectorResource.fetchById(connectorId);

  if (connector && connector.isPaused()) {
    localLogger.info(
      {
        connectorId,
      },
      "Connector is paused, skipping"
    );
    return;
  }

  const webCrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connectorId);

  if (!connector || !webCrawlerConfig) {
    localLogger.error(
      { connectorId },
      "Connector or WebcrawlerConfig not found"
    );
    return;
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  // Scrape GET request is non documented.
  const res = await fetch(`https://api.firecrawl.dev/v1/scrape/${scrapeId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiConfig.getFirecrawlAPIConfig().apiKey}`,
    },
  });

  if (res.status !== 200) {
    localLogger.error(
      { status: res.status, scrapeId },
      "Failed to fetch Firecrawl scrape details"
    );
    return;
  }

  const r = (await res.json()) as {
    success: boolean;
    data: FirecrawlDocument<undefined>;
    error: unknown;
  };

  if (!r.success) {
    localLogger.error({ scrapeId, error: r.error }, "Firecrawl scrape failed");
    return;
  }

  if (!r.data) {
    localLogger.error({ scrapeId }, "No data found in Firecrawl document");
    return;
  }

  const extracted = r.data.markdown ?? "[NO CONTENT]";

  const pageTitle = r.data.metadata?.title ?? randomUUID();
  const sourceUrl = r.data.metadata?.sourceURL;
  if (!sourceUrl) {
    localLogger.error(
      { scrapeId },
      "No source URL found in Firecrawl document"
    );
    return;
  }

  // Note that parentFolderUrls.length === parentFolderIds.length -1 since parentFolderIds includes
  // the page as first element and parentFolderUrls does not.
  const parentFolderUrls = getAllFoldersForUrl(sourceUrl);
  const parentFolderIds = getParentsForPage(sourceUrl, false);

  for (const [index, folder] of parentFolderUrls.entries()) {
    const logicalParent = isTopFolder(sourceUrl)
      ? null
      : getFolderForUrl(folder);
    const [webCrawlerFolder] = await WebCrawlerFolderModel.upsert({
      url: folder,
      parentUrl: logicalParent,
      connectorId: connector.id,
      webcrawlerConfigurationId: webCrawlerConfig.id,
      internalId: stableIdForUrl({
        url: folder,
        ressourceType: "folder",
      }),
      lastSeenAt: new Date(),
    });

    // Parent folder ids of the page are in hierarchy order from the page to the root so for the
    // current folder, its parents start at index+1 (including itself as first parent) and end at
    // the root.
    const parents = parentFolderIds.slice(index + 1);
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: webCrawlerFolder.internalId,
      timestampMs: webCrawlerFolder.updatedAt.getTime(),
      parents,
      parentId: parents[1] || null,
      title: getDisplayNameForFolder(webCrawlerFolder),
      mimeType: INTERNAL_MIME_TYPES.WEBCRAWLER.FOLDER,
      sourceUrl: webCrawlerFolder.url,
    });
  }
  const documentId = stableIdForUrl({
    url: sourceUrl,
    ressourceType: "document",
  });

  await WebCrawlerPageModel.upsert({
    url: sourceUrl,
    parentUrl: isTopFolder(sourceUrl) ? null : getFolderForUrl(sourceUrl),
    connectorId: connector.id,
    webcrawlerConfigurationId: webCrawlerConfig.id,
    documentId: documentId,
    title: pageTitle,
    depth: 0,
    lastSeenAt: new Date(),
  });

  localLogger.info(
    {
      documentId,
      configId: webCrawlerConfig.id,
      documentLen: extracted.length,
      url: sourceUrl,
    },
    "Successfully processed crawl page"
  );

  statsDClient.increment("connectors_webcrawler_crawls.count", 1);
  statsDClient.increment(
    "connectors_webcrawler_crawls_bytes.count",
    extracted.length
  );

  Context.current().heartbeat({
    type: "upserting",
    url: sourceUrl,
  });

  try {
    if (
      extracted.length > 0 &&
      extracted.length <= MAX_SMALL_DOCUMENT_TXT_LEN
    ) {
      const validatedUrl = validateUrl(sourceUrl);
      if (!validatedUrl.valid || !validatedUrl.standardized) {
        localLogger.info(
          {
            documentId,
            configId: webCrawlerConfig.id,
            url: sourceUrl,
          },
          `Invalid document or URL. Skipping`
        );
        return;
      }

      const formattedDocumentContent = formatDocumentContent({
        title: pageTitle,
        content: extracted,
        url: validatedUrl.standardized,
      });

      await upsertDataSourceDocument({
        dataSourceConfig,
        documentId: documentId,
        documentContent: formattedDocumentContent,
        documentUrl: validatedUrl.standardized,
        timestampMs: new Date().getTime(),
        tags: [`title:${stripNullBytes(pageTitle)}`],
        parents: parentFolderIds,
        parentId: parentFolderIds[1] || null,
        loggerArgs: { connectorId },
        upsertContext: {
          sync_type: "batch",
        },
        title: stripNullBytes(pageTitle),
        mimeType: "text/html",
        async: true,
      });
    } else {
      localLogger.info(
        {
          documentId,
          configId: webCrawlerConfig.id,
          documentLen: extracted.length,
          title: pageTitle,
          url: sourceUrl,
        },
        `Document is empty or too big to be upserted. Skipping`
      );
      return;
    }
  } catch (e) {
    localLogger.error(
      {
        error: e,
        configId: webCrawlerConfig.id,
        url: sourceUrl,
      },
      "Webcrawler error while upserting document"
    );
  }

  if (!connector?.firstSuccessfulSyncTime) {
    // If this is the first sync we report the progress. This is a bit racy but that's not a big
    // problem as this is simple reporting of initial progress.
    const pagesCount = await WebCrawlerPageModel.count({
      where: {
        connectorId,
        webcrawlerConfigurationId: webCrawlerConfig.id,
      },
    });

    await reportInitialSyncProgress(connector.id, `${pagesCount} pages`);
  }
}

export async function firecrawlCrawlCompleted(
  connectorId: ModelId,
  crawlId: string
) {
  const localLogger = logger.child({
    connectorId,
    crawlId,
  });

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    localLogger.error({ connectorId }, "Connector not found");
    return;
  }

  const webConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connectorId);
  if (webConfig === null) {
    localLogger.error({ connectorId }, "WebCrawlerConfiguration not found");
    return;
  }

  // Clean the crawlId
  await webConfig.updateCrawlId(null);

  try {
    const crawlStatus = await getFirecrawl().checkCrawlStatus(crawlId);
    if (!crawlStatus.success) {
      localLogger.error(
        { connectorId, crawlId },
        `Couldn't fetch crawl status: ${crawlStatus.error}`
      );
      return;
    }

    if (crawlStatus.completed <= 0) {
      // No content found, checking if it's blocked for robots.
      const crawlErrors = await getFirecrawl().checkCrawlErrors(crawlId);
      // Typing issue from Firecrawl, 'success = true' is not in the CrawlErrorsResponse
      if ("success" in crawlErrors) {
        localLogger.error(
          { connectorId, crawlId },
          `Couldn't fetch crawl error: ${crawlErrors.error}`
        );
        return;
      }

      // Check if the rootUrl is blocked for robots
      if (crawlErrors.robotsBlocked.includes(webConfig.url)) {
        await syncFailed(connectorId, "webcrawling_error_blocked");
      } else {
        await syncFailed(connectorId, "webcrawling_error_empty_content");
      }
      return {
        lastSyncStartTs: connector.lastSyncStartTime?.getTime() ?? null,
      };
    }

    if (crawlStatus.completed < webConfig.maxPageToCrawl) {
      await syncSucceeded(connectorId);
    } else {
      await syncFailed(
        connectorId,
        "webcrawling_synchronization_limit_reached"
      );
    }
  } catch (error) {
    if (error instanceof FirecrawlError) {
      /*
       * Putting the connector in succeed as we did get a `completed` event from Firecrawl.
       * But we couldn't check the correct status or errors of it.
       * Those expire after 24h, so we might just be late to the party.
       */
      await syncSucceeded(connectorId);

      if (error.statusCode === 404 && error.message === "Job expired") {
        localLogger.warn(
          {
            connectorId,
            crawlId,
            firecrawlError: {
              statusCode: error.statusCode,
              name: error.name,
            },
          },
          "Firecrawl job expired. They expired 24h after the crawl finish. Moving the connector to succeed."
        );
      } else {
        localLogger.error(
          {
            connectorId,
            crawlId,
            firecrawlError: {
              statusCode: error.statusCode,
              name: error.name,
            },
          },
          `Error feching crawl status or error: ${error.message}`
        );
      }

      return {
        lastSyncStartTs: connector.lastSyncStartTime?.getTime() ?? null,
      };
    }

    // If we didn't get a handled FirecrawlError, we can bubble up the error.
    throw error;
  }

  return {
    lastSyncStartTs: connector.lastSyncStartTime?.getTime() ?? null,
  };
}
