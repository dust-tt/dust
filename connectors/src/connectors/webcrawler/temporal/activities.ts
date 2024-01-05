import { ModelId } from "@dust-tt/types";
import { CheerioCrawler, Configuration } from "crawlee";
import turndown from "turndown";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertToDatasource } from "@connectors/lib/data_sources";
import { Connector } from "@connectors/lib/models";
import {
  WebCrawlerConfiguration,
  WebCrawlerFolder,
} from "@connectors/lib/models/webcrawler";
import {
  reportInitialSyncProgress,
  syncSucceeded,
} from "@connectors/lib/sync_status";

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

  return crawlWebsite(webCrawlerConfig.id);
}

export async function crawlWebsite(
  webcrawlerConfigurationId: ModelId
): Promise<{ pageCount: number; errorCount: number }> {
  const webCrawlerConfig = await WebCrawlerConfiguration.findByPk(
    webcrawlerConfigurationId
  );
  if (!webCrawlerConfig) {
    throw new Error(
      `Webcrawler configuration ${webcrawlerConfigurationId} not found.`
    );
  }

  const connector = await Connector.findByPk(webCrawlerConfig.connectorId);
  if (!connector) {
    throw new Error(`Connector ${webCrawlerConfig.connectorId} not found.`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  let pageCount = 0;
  let errorCount = 0;
  const createdFolders = new Set<string>();

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: 300,
      maxConcurrency: 1,

      async requestHandler({ $, request, enqueueLinks }) {
        const extracted = new turndown()
          .remove(["style", "script", "iframe"])
          .turndown($.html());

        // Finally, we have to add the URLs to the queue
        // await crawler.addRequests(absoluteUrls);
        await enqueueLinks();

        const folders = getAllFoldersForUrl(request.url);
        for (const folder of folders) {
          if (!folder.startsWith(webCrawlerConfig.url)) {
            continue;
          }
          if (createdFolders.has(folder)) {
            continue;
          }
          await WebCrawlerFolder.upsert({
            url: folder,
            parentUrl: getFolderForUrl(folder) || webCrawlerConfig.url,
            connectorId: connector.id,
            webcrawlerConfigurationId: webCrawlerConfig.id,
            ressourceType: "folder",
            dustDocumentId: null,
          });
          createdFolders.add(folder);
        }

        const updatedFolder = await WebCrawlerFolder.upsert({
          url: request.url,
          parentUrl: getFolderForUrl(request.url) || webCrawlerConfig.url,
          connectorId: connector.id,
          webcrawlerConfigurationId: webCrawlerConfig.id,
          ressourceType: "file",
          dustDocumentId: request.url,
        });

        await upsertToDatasource({
          dataSourceConfig,
          documentId: encodeURIComponent(
            updatedFolder[0].dustDocumentId as string
          ),
          documentContent: {
            prefix: null,
            content: extracted,
            sections: [],
          },
          documentUrl: request.url,
          timestampMs: new Date().getTime(),
          tags: [],
          parents: [],
          upsertContext: {
            sync_type: "batch",
          },
        });
        await reportInitialSyncProgress(
          connector.id,
          `Crawled ${pageCount} pages.`
        );

        pageCount++;
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

  // Start the crawler and wait for it to finish

  await crawler.run([webCrawlerConfig.url]);
  if (pageCount > 0) {
    await syncSucceeded(connector.id);
  }

  await crawler.teardown();
  return {
    pageCount,
    errorCount,
  };
}

export function getAllFoldersForUrl(url: string) {
  const parents: string[] = [];

  let parent: string | null = null;
  while ((parent = getFolderForUrl(url))) {
    parents.push(parent);
    url = parent;
  }

  return parents;
}

export function getFolderForUrl(url: string) {
  const parsed = new URL(url);
  const urlParts = parsed.pathname.split("/").filter((part) => part.length > 0);
  console.log("urlParts", urlParts);
  if (urlParts.length < 2) {
    return null;
  } else {
    return `${parsed.origin}/${urlParts.slice(0, -1).join("/")}/`;
  }
}
