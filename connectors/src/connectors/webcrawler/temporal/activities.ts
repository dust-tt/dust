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

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  let pageCount = 0;
  let errorCount = 0;
  const createdFolders = new Set<string>();

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: 300,
      maxConcurrency: 10,

      async requestHandler({ $, request, enqueueLinks }) {
        const extracted = new turndown()
          .remove(["style", "script", "iframe"])
          .turndown($.html());

        const pageTitle = $("title").text();

        await enqueueLinks();

        const folders = getAllFoldersForUrl(request.url);
        for (const folder of folders) {
          if (!folder.startsWith(webCrawlerConfig.url)) {
            continue;
          }
          if (createdFolders.has(folder)) {
            continue;
          }

          const logicalParent =
            folder === webCrawlerConfig.url ? null : getFolderForUrl(folder);
          await WebCrawlerFolder.upsert({
            url: folder,
            parentUrl: logicalParent,
            connectorId: connector.id,
            webcrawlerConfigurationId: webCrawlerConfig.id,
            ressourceType: "folder",
            title: null,
          });
          createdFolders.add(folder);
        }

        const logicalParent =
          request.url === webCrawlerConfig.url
            ? null
            : getFolderForUrl(request.url);
        const updatedFolder = await WebCrawlerFolder.upsert({
          url: request.url,
          parentUrl: logicalParent,
          connectorId: connector.id,
          webcrawlerConfigurationId: webCrawlerConfig.id,
          ressourceType: "file",
          title: pageTitle,
        });

        await upsertToDatasource({
          dataSourceConfig,
          documentId: updatedFolder[0].id.toString(),
          documentContent: {
            prefix: pageTitle,
            content: extracted,
            sections: [],
          },
          documentUrl: request.url,
          timestampMs: new Date().getTime(),
          tags: [`title:${pageTitle.substring(0, 300)}`],
          parents: folders,
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

// Returns all parent folders for a given url
// eg: https://example.com/a/b/c -> [https://example.com/a/b, https://example.com/a, https://example.com/]
export function getAllFoldersForUrl(url: string) {
  const parents: string[] = [];

  let parent: string | null = null;
  while ((parent = getFolderForUrl(url))) {
    parents.push(parent);
    url = parent;
  }

  return parents;
}

// Returns the parent folder for a given url
// eg: https://example.com/foo/bar -> https://example.com/foo
// eg: https://example.com/foo -> https://example.com/
export function getFolderForUrl(url: string) {
  const parsed = new URL(url);
  const urlParts = parsed.pathname.split("/").filter((part) => part.length > 0);
  if (parsed.pathname === "/") {
    return null;
  } else {
    return `${parsed.origin}/${urlParts.slice(0, -1).join("/")}`;
  }
}
