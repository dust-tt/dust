import type {
  CoreAPIDataSourceDocumentSection,
  CrawlingFrequency,
} from "@dust-tt/types";
import type { ModelId } from "@dust-tt/types";
import {
  CrawlingFrequencies,
  WEBCRAWLER_MAX_DEPTH,
  WEBCRAWLER_MAX_PAGES,
} from "@dust-tt/types";
import { Context } from "@temporalio/activity";
import { isCancellation } from "@temporalio/workflow";
import { CheerioCrawler, Configuration } from "crawlee";
import { literal, Op } from "sequelize";
import turndown from "turndown";

import {
  getAllFoldersForUrl,
  getFolderForUrl,
  getParentsForPage,
  isTopFolder,
  stableIdForUrl,
} from "@connectors/connectors/webcrawler/lib/utils";
import { REQUEST_HANDLING_TIMEOUT } from "@connectors/connectors/webcrawler/temporal/workflows";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteFromDataSource,
  MAX_DOCUMENT_TXT_LEN,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import {
  WebCrawlerConfiguration,
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import {
  reportInitialSyncProgress,
  syncFailed,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const CONCURRENCY = 4;

export async function crawlWebsiteByConnectorId(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found.`);
  }
  const webCrawlerConfig = await WebCrawlerConfiguration.findOne({
    where: {
      connectorId,
    },
  });
  if (!webCrawlerConfig) {
    throw new Error(`Webcrawler configuration not found for connector.`);
  }
  webCrawlerConfig.lastCrawledAt = new Date();
  // Immeditaley marking the config as crawled to avoid having the scheduler seeing it as a candidate for crawling
  // in case of the crawling taking too long or failing.
  await webCrawlerConfig.save();

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  let pageCount = 0;
  let crawlingError = 0;
  let upsertingError = 0;
  const createdFolders = new Set<string>();

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: Math.min(
        webCrawlerConfig.maxPageToCrawl || WEBCRAWLER_MAX_PAGES,
        WEBCRAWLER_MAX_PAGES
      ),
      maxConcurrency: CONCURRENCY,
      maxRequestsPerMinute: 60, // 5 requests per second to avoid overloading the target website
      requestHandlerTimeoutSecs: REQUEST_HANDLING_TIMEOUT,
      async requestHandler({ $, request, enqueueLinks }) {
        Context.current().heartbeat({
          type: "http_request",
        });
        const currentRequestDepth = request.userData.depth || 0;

        // try-catch allowing activity cancellation by temporal (timeout, or signal)
        try {
          await Context.current().sleep(1);
        } catch (e) {
          if (isCancellation(e)) {
            logger.error("The activity was canceled. Aborting crawl.");
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
              logger.info(
                {
                  depth: request.userData.depth,
                  url: request.url,
                  connectorId: connector.id,
                  configId: webCrawlerConfig.id,
                },
                "reached max depth"
              );
              return false;
            }
            return req;
          },
        });
        const extracted = new turndown()
          .remove(["style", "script", "iframe"])
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
            extracted.length <= MAX_DOCUMENT_TXT_LEN
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
              async: false,
            });
          } else {
            logger.info(
              {
                documentId,
                connectorId,
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
          logger.error(
            {
              error: e,
              connectorId: connector.id,
              configId: webCrawlerConfig.id,
              url,
            },
            "Webcrawler error while upserting document"
          );
        }

        pageCount++;
        await reportInitialSyncProgress(connector.id, `${pageCount} pages`);
      },
      failedRequestHandler: async (context, err) => {
        logger.error(
          { error: err, connectorId: connector.id },
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
    })
  );

  let url = webCrawlerConfig.url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `http://${url}`;
  }
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
  const webCrawlerConfig = await WebCrawlerConfiguration.findOne({
    where: {
      connectorId,
    },
  });
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

export async function getWebsitesToCrawl() {
  const frequencyToSQLQuery: Record<CrawlingFrequency, string> = {
    never: "never",
    daily: "1 day",
    weekly: "1 week",
    monthly: "1 month",
  };
  const allConnectorIds: ModelId[] = [];

  for (const frequency of CrawlingFrequencies) {
    if (frequency === "never") {
      continue;
    }
    const sql = frequencyToSQLQuery[frequency];
    const websites = await WebCrawlerConfiguration.findAll({
      where: {
        lastCrawledAt: {
          [Op.lt]: literal(`NOW() - INTERVAL '${sql}'`),
        },
        crawlFrequency: frequency,
      },
    });
    allConnectorIds.push(...websites.map((w) => w.connectorId));
  }

  return allConnectorIds;
}
