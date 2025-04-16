import { Context } from "@temporalio/activity";
import { isCancellation } from "@temporalio/workflow";
import { Configuration, LogLevel, PlaywrightCrawler } from "crawlee";
import { Op } from "sequelize";
import turndown from "turndown";

import {
  getAllFoldersForUrl,
  getDisplayNameForFolder,
  getFolderForUrl,
  getIpAddressForUrl,
  getParentsForPage,
  isPrivateIp,
  isTopFolder,
  stableIdForUrl,
} from "@connectors/connectors/webcrawler/lib/utils";
import {
  MAX_BLOCKED_RATIO,
  MAX_PAGES_TOO_LARGE_RATIO,
  MAX_TIME_TO_CRAWL_MINUTES,
  MIN_EXTRACTED_TEXT_LENGTH,
  REQUEST_HANDLING_TIMEOUT,
} from "@connectors/connectors/webcrawler/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  MAX_SMALL_DOCUMENT_TXT_LEN,
  upsertDataSourceDocument,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
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
  stripNullBytes,
  WEBCRAWLER_MAX_DEPTH,
  WEBCRAWLER_MAX_PAGES,
} from "@connectors/types";
import { validateUrl } from "@connectors/types";

const CONCURRENCY = 1;

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
  const startCrawlingTime = Date.now();
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

  await syncStarted(connectorId);

  const customHeaders = webCrawlerConfig.getCustomHeaders();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const pageCount = {
    valid: 0,
    tooLarge: 0,
    blocked: 0,
    total() {
      return this.valid + this.tooLarge + this.blocked;
    },
  };
  let totalExtracted = 0;
  let crawlingError = 0;
  let upsertingError = 0;
  const createdFolders = new Set<string>();

  const maxRequestsPerCrawl =
    webCrawlerConfig.maxPageToCrawl || WEBCRAWLER_MAX_PAGES;

  const crawler = new PlaywrightCrawler(
    {
      navigationTimeoutSecs: 10,
      preNavigationHooks: [
        async (crawlingContext) => {
          Context.current().heartbeat({
            type: "pre_navigation",
          });

          const { address, family } = await getIpAddressForUrl(
            crawlingContext.request.url
          );
          if (family !== 4) {
            crawlingContext.request.skipNavigation = true;
            childLogger.error(
              {
                url: crawlingContext.request.url,
              },
              `IP address is not IPv4. Skipping.`
            );
          }
          if (isPrivateIp(address)) {
            crawlingContext.request.skipNavigation = true;
            childLogger.error(
              {
                url: crawlingContext.request.url,
              },
              `Private IP address detected. Skipping.`
            );
          }

          if (!crawlingContext.request.headers) {
            crawlingContext.request.headers = {};
          }
          for (const [header, value] of Object.entries(customHeaders)) {
            crawlingContext.request.headers[header] = value;
          }
        },
      ],
      maxRequestsPerCrawl,
      maxConcurrency: CONCURRENCY,
      maxRequestsPerMinute: 20, // 1 request every 3 seconds average, to avoid overloading the target website
      requestHandlerTimeoutSecs: REQUEST_HANDLING_TIMEOUT,
      async requestHandler({ page, request, enqueueLinks }) {
        Context.current().heartbeat({
          type: "http_request",
        });
        const currentRequestDepth = request.userData.depth || 0;

        // try-catch allowing activity cancellation by temporal (various timeouts, or signal)
        try {
          await Context.current().sleep(1);
        } catch (e) {
          if (isCancellation(e)) {
            childLogger.error(
              { error: e },
              "The activity was canceled. Aborting crawl."
            );

            // raise a panic flag if the activity is aborted because it exceeded the maximum time to crawl
            const isTooLongToCrawl =
              Date.now() - startCrawlingTime >
              1000 * 60 * (MAX_TIME_TO_CRAWL_MINUTES - 1);

            if (isTooLongToCrawl) {
              childLogger.error(
                {
                  url: rootUrl,
                  configId: webCrawlerConfig.id,
                  panic: true,
                  crawls_per_minute: Math.round(
                    pageCount.valid / MAX_TIME_TO_CRAWL_MINUTES
                  ),
                },
                `Website takes too long to crawl`
              );
            }

            // abort crawling
            await crawler.autoscaledPool?.abort();
            await crawler.teardown();
            // leave without rethrowing, to avoid retries by the crawler
            // (the cancellation already throws at the activity & workflow level)
            return;
          }
          throw e;
        }

        await enqueueLinks({
          userData: {
            depth: currentRequestDepth + 1,
          },
          transformRequestFunction: (req) => {
            try {
              if (
                new URL(req.url).protocol !== "http:" &&
                new URL(req.url).protocol !== "https:"
              ) {
                return false;
              }
            } catch (e) {
              return false;
            }
            if (webCrawlerConfig.crawlMode === "child") {
              // We only want to crawl children of the original url
              if (
                !new URL(req.url).pathname.startsWith(
                  new URL(webCrawlerConfig.url).pathname
                )
              ) {
                // path is not a child of the original url
                return false;
              }
            }
            if (
              req.userData?.depth >= WEBCRAWLER_MAX_DEPTH ||
              req.userData?.depth >= webCrawlerConfig.depth
            ) {
              return false;
            }
            return req;
          },
        });
        const content = await page.content();
        const extracted = new turndown()
          .remove([
            "style",
            "script",
            "iframe",
            "noscript",
            "nav",
            "footer",
            "header",
            "form",
            "meta",
            "img",
          ])
          .turndown(content);

        totalExtracted += extracted.length;
        const pageTitle = await page.title();

        // note that parentFolderUrls.length === parentFolderIds.length -1
        // since parentFolderIds includes the page as first element
        // and parentFolderUrls does not
        const parentFolderUrls = getAllFoldersForUrl(request.url);
        const parentFolderIds = getParentsForPage(request.url, false);

        for (const [index, folder] of parentFolderUrls.entries()) {
          if (createdFolders.has(folder)) {
            continue;
          }

          const logicalParent = isTopFolder(request.url)
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

          // parent folder ids of the page are in hierarchy order from the
          // page to the root so for the current folder, its parents start at
          // index+1 (including itself as first parent) and end at the root
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

          createdFolders.add(folder);
        }
        const documentId = stableIdForUrl({
          url: request.url,
          ressourceType: "document",
        });

        await WebCrawlerPage.upsert({
          url: request.url,
          parentUrl: isTopFolder(request.url)
            ? null
            : getFolderForUrl(request.url),
          connectorId: connector.id,
          webcrawlerConfigurationId: webCrawlerConfig.id,
          documentId: documentId,
          title: pageTitle,
          depth: currentRequestDepth,
          lastSeenAt: new Date(),
        });

        childLogger.info(
          {
            documentId,
            configId: webCrawlerConfig.id,
            documentLen: extracted.length,
            url: rootUrl,
          },
          "Successfully crawled page"
        );

        statsDClient.increment("connectors_webcrawler_crawls.count", 1);
        statsDClient.increment(
          "connectors_webcrawler_crawls_bytes.count",
          extracted.length
        );

        Context.current().heartbeat({
          type: "upserting",
        });

        try {
          if (extracted.length > MAX_SMALL_DOCUMENT_TXT_LEN) {
            pageCount.tooLarge++;
          }
          if (
            extracted.length > 0 &&
            extracted.length <= MAX_SMALL_DOCUMENT_TXT_LEN
          ) {
            const validatedUrl = validateUrl(request.url);
            if (!validatedUrl.valid || !validatedUrl.standardized) {
              childLogger.info(
                { documentId, configId: webCrawlerConfig.id, url: request.url },
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
            childLogger.info(
              {
                documentId,
                configId: webCrawlerConfig.id,
                documentLen: extracted.length,
                title: pageTitle,
                url: request.url,
              },
              `Document is empty or too big to be upserted. Skipping`
            );
            return;
          }
        } catch (e) {
          upsertingError++;
          childLogger.error(
            {
              error: e,
              configId: webCrawlerConfig.id,
              url: rootUrl,
            },
            "Webcrawler error while upserting document"
          );
        }

        pageCount.valid++;
        await reportInitialSyncProgress(
          connector.id,
          `${pageCount.valid} pages`
        );
      },
      failedRequestHandler: async (context, error) => {
        Context.current().heartbeat({
          type: "failed_request",
        });
        childLogger.error(
          {
            url: context.request.url,
            error,
          },
          "webcrawler failedRequestHandler"
        );
        if (
          !context.response ||
          context.response.statusCode === 403 ||
          context.response.statusCode === 429
        ) {
          pageCount.blocked++;
        }
        crawlingError++;
      },
      errorHandler: () => {
        // Errors are already logged by the crawler, so we are not re-logging them here.
        Context.current().heartbeat({
          type: "error_handler",
        });
      },
    },
    new Configuration({
      purgeOnStart: true,
      persistStorage: false,
      logLevel: LogLevel.OFF,
      availableMemoryRatio: 0.1,
    })
  );

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

  const stats = await crawler.run([rootUrl]);

  await crawler.teardown();

  // checks for cancellation and throws if it's the case
  await Context.current().sleep(1);

  if (pageCount.blocked / pageCount.total() > MAX_BLOCKED_RATIO) {
    await syncFailed(connector.id, "webcrawling_error_blocked");
  } else if (
    pageCount.tooLarge / pageCount.total() >
    MAX_PAGES_TOO_LARGE_RATIO
  ) {
    await syncFailed(connector.id, "webcrawling_error_content_too_large");
  } else if (totalExtracted < MIN_EXTRACTED_TEXT_LENGTH) {
    await syncFailed(connector.id, "webcrawling_error_empty_content");
  } else if (pageCount.valid === 0) {
    await syncFailed(connector.id, "webcrawling_error");
  } else if (stats.requestsFinished >= maxRequestsPerCrawl) {
    await syncFailed(connector.id, "webcrawling_synchronization_limit_reached");
  } else {
    await syncSucceeded(connector.id);
  }
  if (upsertingError > 0) {
    throw new Error(
      `Webcrawler failed while upserting documents to Dust. Error count: ${upsertingError}`
    );
  }

  childLogger.info(
    {
      url: rootUrl,
      pageCount: pageCount.valid,
      crawlingError,
      configId: webCrawlerConfig.id,
    },
    "Webcrawler activity finished"
  );

  return {
    pageCount: pageCount.valid,
    crawlingError,
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
  const urlWithoutQuery = `${parsedUrl.origin}/${parsedUrl.pathname}`;

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
