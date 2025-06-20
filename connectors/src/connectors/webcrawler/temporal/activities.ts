import type { FirecrawlDocument } from "@mendable/firecrawl-js";
import { Context } from "@temporalio/activity";
import { randomUUID } from "crypto";
import path from "path";
import { Op } from "sequelize";

import {
  getAllFoldersForUrl,
  getDisplayNameForFolder,
  getFolderForUrl,
  getParentsForPage,
  isTopFolder,
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
  WebCrawlerFolder,
  WebCrawlerPage,
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
  WEBCRAWLER_MAX_DEPTH,
  WEBCRAWLER_MAX_PAGES,
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

  const firecrawlApp = getFirecrawl();

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

  const customHeaders = webCrawlerConfig.getCustomHeaders();

  const maxRequestsPerCrawl =
    webCrawlerConfig.maxPageToCrawl || WEBCRAWLER_MAX_PAGES;

  let rootUrl = webCrawlerConfig.url.trim();
  if (!rootUrl.startsWith("http://") && !rootUrl.startsWith("https://")) {
    rootUrl = `http://${rootUrl}`;
  }

  let crawlerResponse;
  try {
    crawlerResponse = await firecrawlApp.asyncCrawlUrl(rootUrl, {
      maxDiscoveryDepth: webCrawlerConfig.depth ?? WEBCRAWLER_MAX_DEPTH,
      limit: maxRequestsPerCrawl,
      allowBackwardLinks: webCrawlerConfig.crawlMode === "website",
      delay: 3,
      scrapeOptions: {
        onlyMainContent: true,
        formats: ["markdown"],
        headers: customHeaders,
        maxAge: 43_200_000, // Use last 12h of cache
      },
      webhook: {
        url: `${apiConfig.getConnectorsPublicURL()}/webhooks/${apiConfig.getDustConnectorsWebhooksSecret()}/firecrawl`,
        metadata: {
          connectorId: String(connectorId),
        },
      },
    });
  } catch (error) {
    // Handle thrown errors from Firecrawl API
    const errorMessage = normalizeError(error).message;
    crawlerResponse = {
      success: false,
      error: errorMessage,
    };
  }

  if (!crawlerResponse.success) {
    const errorMessage = crawlerResponse.error || "Unknown error";
    childLogger.error(
      {
        error: errorMessage,
        url: rootUrl,
        connectorId,
      },
      "Firecrawl crawl failed"
    );

    // Check if it's a 403 error for unsupported websites.
    if (
      errorMessage.includes("status code 403") ||
      errorMessage.includes("no longer supported")
    ) {
      await syncFailed(connectorId, "webcrawling_error_blocked");
    } else {
      await syncFailed(connectorId, "webcrawling_error");
    }

    // Return gracefully instead of throwing to prevent workflow from getting stuck.
    return {
      launchGarbageCollect: false,
      startedAtTs: startedAt.getTime(),
    };
  }

  if (crawlerResponse.id) {
    await webCrawlerConfig.updateCrawlId(crawlerResponse.id);
  } else {
    // Shouldn't happen, but based on the types, let's make sure
    childLogger.warn(
      { webCrawlerConfigId: webCrawlerConfig.id, url: rootUrl },
      "No ID found when creating a Firecrawl crawler"
    );
  }

  childLogger.info(
    { crawlerId: crawlerResponse.id, url: rootUrl },
    "Firecrawl crawler started"
  );
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
    const [webCrawlerFolder] = await WebCrawlerFolder.upsert({
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

  await WebCrawlerPage.upsert({
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
    const pagesCount = await WebCrawlerPage.count({
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

  const crawlStatus = await getFirecrawl().checkCrawlStatus(crawlId);
  if (!crawlStatus.success) {
    localLogger.error(
      { connectorId, crawlId },
      `Couldn't fetch crawl status: ${crawlStatus.error}`
    );
    return;
  }

  if (crawlStatus.completed <= 0) {
    try {
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
    } catch (err) {
      localLogger.warn(
        { connectorId, crawlId },
        `Couldn't check crawl errors: ${normalizeError(err)}`
      );
      await syncFailed(connectorId, "webcrawling_error_empty_content");
      return {
        lastSyncStartTs: connector.lastSyncStartTime?.getTime() ?? null,
      };
    }
  }

  if (crawlStatus.completed >= webConfig.maxPageToCrawl) {
    await syncFailed(connectorId, "webcrawling_synchronization_limit_reached");
  } else {
    await syncSucceeded(connector.id);
  }

  return {
    lastSyncStartTs: connector.lastSyncStartTime?.getTime() ?? null,
  };
}
