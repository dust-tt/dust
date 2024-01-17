import type { ModelId } from "@dust-tt/types";
import { Context } from "@temporalio/activity";
import { CheerioCrawler, Configuration } from "crawlee";
import PQueue from "p-queue";
import turndown from "turndown";

import {
  getAllFoldersForUrl,
  getFolderForUrl,
  getParentsForPage,
  isTopFolder,
  stableIdForUrl,
} from "@connectors/connectors/webcrawler/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertToDatasource } from "@connectors/lib/data_sources";
import { Connector } from "@connectors/lib/models";
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

const MAX_DEPTH = 5;
const MAX_PAGES = 512;
const CONCURRENCY = 10;
const UPSERT_CONCURRENCY = 4;

export async function crawlWebsiteByConnectorId(connectorId: ModelId) {
  const connector = await Connector.findByPk(connectorId);
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
  let errorCount = 0;
  const createdFolders = new Set<string>();
  const processQueue = new PQueue({ concurrency: UPSERT_CONCURRENCY });

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: MAX_PAGES,
      maxConcurrency: CONCURRENCY,

      async requestHandler({ $, request, enqueueLinks }) {
        Context.current().heartbeat({
          type: "http_request",
        });
        await enqueueLinks({
          userData: {
            depth: request.userData.depth ? request.userData.depth + 1 : 1,
          },
          transformRequestFunction: (req) => {
            if (request.userData.depth > MAX_DEPTH) {
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
        void processQueue.add(async () => {
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
          await upsertToDatasource({
            dataSourceConfig,
            documentId: documentId,
            documentContent: {
              prefix: pageTitle,
              content: extracted,
              sections: [],
            },
            documentUrl: request.url,
            timestampMs: new Date().getTime(),
            tags: [`title:${pageTitle.substring(0, 300)}`],
            parents: getParentsForPage(request.url, false),
            upsertContext: {
              sync_type: "batch",
            },
          });

          pageCount++;
          await reportInitialSyncProgress(connector.id, `${pageCount} pages`);
        });
      },
      failedRequestHandler: async () => {
        errorCount++;
      },
    },
    new Configuration({
      purgeOnStart: true,
      persistStorage: false,
    })
  );

  await crawler.run([webCrawlerConfig.url]);
  await crawler.teardown();
  await processQueue.onIdle();

  if (pageCount > 0) {
    await syncSucceeded(connector.id);
  }

  return {
    pageCount,
    errorCount,
  };
}
