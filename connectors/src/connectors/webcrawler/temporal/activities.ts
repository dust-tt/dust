import type { CoreAPIDataSourceDocumentSection } from "@dust-tt/types";
import type { ModelId } from "@dust-tt/types";
import { WEBCRAWLER_MAX_DEPTH, WEBCRAWLER_MAX_PAGES } from "@dust-tt/types";
import { Context } from "@temporalio/activity";
import { isCancellation } from "@temporalio/workflow";
import { CheerioCrawler, Configuration, LogLevel } from "crawlee";
import { Op } from "sequelize";
import turndown from "turndown";

import {
  getAllFoldersForUrl,
  getFolderForUrl,
  getIpAddressForUrl,
  getParentsForPage,
  isPrivateIp,
  isTopFolder,
  stableIdForUrl,
} from "@connectors/connectors/webcrawler/lib/utils";
import {
  MAX_TIME_TO_CRAWL_MINUTES,
  REQUEST_HANDLING_TIMEOUT,
} from "@connectors/connectors/webcrawler/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteFromDataSource,
  MAX_SMALL_DOCUMENT_TXT_LEN,
  upsertToDatasource,
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
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";

const CONCURRENCY = 1;

export async function markAsCrawled(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found.`);
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
    throw new Error(`Connector ${connectorId} not found.`);
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
  let pageCount = 0;
  let crawlingError = 0;
  let upsertingError = 0;
  const createdFolders = new Set<string>();

  const crawler = new CheerioCrawler(
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
      maxRequestsPerCrawl:
        webCrawlerConfig.maxPageToCrawl || WEBCRAWLER_MAX_PAGES,

      maxConcurrency: CONCURRENCY,
      maxRequestsPerMinute: 20, // 1 request every 3 seconds average, to avoid overloading the target website
      requestHandlerTimeoutSecs: REQUEST_HANDLING_TIMEOUT,
      async requestHandler({ $, request, enqueueLinks }) {
        Context.current().heartbeat({
          type: "http_request",
        });
        const currentRequestDepth = request.userData.depth || 0;

        // try-catch allowing activity cancellation by temporal (various timeouts, or signal)
        try {
          await Context.current().sleep(1);
        } catch (e) {
          if (isCancellation(e)) {
            childLogger.error("The activity was canceled. Aborting crawl.");

            // raise a panic flag if the activity is aborted because it exceeded the maximum time to crawl
            const isTooLongToCrawl =
              Date.now() - startCrawlingTime >
              1000 * 60 * (MAX_TIME_TO_CRAWL_MINUTES - 1);

            if (isTooLongToCrawl) {
              childLogger.error(
                {
                  url,
                  configId: webCrawlerConfig.id,
                  panic: true,
                },
                `Website takes too long to crawl (crawls ${Math.round(
                  pageCount / MAX_TIME_TO_CRAWL_MINUTES
                )} pages per minute)`
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
          .turndown($.html());

        const pageTitle = $("title").text();

        const folders = getAllFoldersForUrl(request.url);
        for (const folder of folders) {
          if (createdFolders.has(folder)) {
            continue;
          }

          const logicalParent = isTopFolder(request.url)
            ? null
            : getFolderForUrl(folder);
          await WebCrawlerFolder.upsert({
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

          createdFolders.add(folder);
        }
        const documentId = stableIdForUrl({
          url: request.url,
          ressourceType: "file",
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

        Context.current().heartbeat({
          type: "upserting",
        });

        try {
          if (
            extracted.length > 0 &&
            extracted.length <= MAX_SMALL_DOCUMENT_TXT_LEN
          ) {
            await upsertToDatasource({
              dataSourceConfig,
              documentId: documentId,
              documentContent: formatDocumentContent({
                title: pageTitle,
                content: extracted,
                url: request.url,
              }),
              documentUrl: request.url,
              timestampMs: new Date().getTime(),
              tags: [`title:${pageTitle}`],
              parents: getParentsForPage(request.url, false),
              upsertContext: {
                sync_type: "batch",
              },
              async: true,
            });
          } else {
            childLogger.info(
              {
                documentId,
                configId: webCrawlerConfig.id,
                documentLen: extracted.length,
                title: pageTitle,
                url,
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
              url,
            },
            "Webcrawler error while upserting document"
          );
        }

        pageCount++;
        await reportInitialSyncProgress(connector.id, `${pageCount} pages`);
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

  let url = webCrawlerConfig.url.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `http://${url}`;
  }

  childLogger.info(
    {
      url,
      configId: webCrawlerConfig.id,
    },
    "Webcrawler activity started"
  );

  await crawler.run([url]);

  await crawler.teardown();

  // checks for cancellation and throws if it's the case
  await Context.current().sleep(1);

  if (pageCount > 0) {
    await syncSucceeded(connector.id);
  } else {
    await syncFailed(connector.id, "webcrawling_error");
  }
  if (upsertingError > 0) {
    throw new Error(
      `Webcrawler failed whlie upserting documents to Dust. Error count: ${upsertingError}`
    );
  }

  childLogger.info(
    {
      url,
      pageCount,
      crawlingError,
      configId: webCrawlerConfig.id,
    },
    "Webcrawler activity finished"
  );

  return {
    pageCount,
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

  return {
    prefix: `URL: ${urlWithoutQuery.slice(0, URL_MAX_LENGTH)}${
      urlWithoutQuery.length > URL_MAX_LENGTH ? "..." : ""
    }\n`,
    content: `TITLE: ${title.substring(0, TITLE_MAX_LENGTH)}\n${content}`,
    sections: [],
  };
}

export async function webCrawlerGarbageCollector(
  connectorId: ModelId,
  lastSyncStartTsMs: number
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found.`);
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
      await deleteFromDataSource(dataSourceConfig, page.documentId);
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
      await folder.destroy();
    }
  } while (foldersToDelete.length > 0);
}

export async function getConnectorIdsForWebsitesToCrawl() {
  return WebCrawlerConfigurationResource.getConnectorIdsForWebsitesToCrawl();
}
