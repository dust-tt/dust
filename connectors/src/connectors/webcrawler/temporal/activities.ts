import type { CoreAPIDataSourceDocumentSection } from "@dust-tt/types";
import type { ModelId } from "@dust-tt/types";
import { WEBCRAWLER_MAX_DEPTH, WEBCRAWLER_MAX_PAGES } from "@dust-tt/types";
import { Context } from "@temporalio/activity";
import { isCancellation } from "@temporalio/workflow";
import { CheerioCrawler, Configuration } from "crawlee";
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
  syncSucceeded,
} from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const CONCURRENCY = 4;

export async function crawlWebsiteByConnectorId(connectorId: ModelId) {
  const connector = await ConnectorModel.findByPk(connectorId);
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
            depth: request.userData.depth ? request.userData.depth + 1 : 1,
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
              request.userData.depth > WEBCRAWLER_MAX_DEPTH ||
              (webCrawlerConfig.depth &&
                request.userData.depth > webCrawlerConfig.depth)
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
            });
          } else {
            logger.info(
              {
                documentId,
                connectorId,
                configId: webCrawlerConfig.id,
                documentLen: extracted.length,
                title: pageTitle,
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
            },
            "Webcrawler error while upserting document"
          );
        }

        pageCount++;
        await reportInitialSyncProgress(connector.id, `${pageCount} pages`);
      },
      failedRequestHandler: async () => {
        crawlingError++;
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
