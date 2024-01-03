import { ModelId } from "@dust-tt/types";
import { CheerioCrawler, RequestQueue } from "crawlee";
import turndown from "turndown";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertToDatasource } from "@connectors/lib/data_sources";
import { Connector } from "@connectors/lib/models";
import { WebCrawlerFolder } from "@connectors/lib/models/webcrawler";

export async function crawlWebsite(
  connectorId: ModelId,
  url: string
): Promise<{ pageCount: number; errorCount: number }> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found.`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const requestQueue = await RequestQueue.open();
  await requestQueue.addRequest({
    url: url,
  });

  // Create the crawler and add the queue with our URL
  // and a request handler to process the page.
  let pageCount = 0;
  let errorCount = 0;
  const createdFolders = new Set<string>();

  const crawler = new CheerioCrawler({
    requestQueue,
    // The `$` argument is the Cheerio object
    // which contains parsed HTML of the website.
    async requestHandler({ $, request, enqueueLinks }) {
      // Extract <title> text with Cheerio.
      // See Cheerio documentation for API docs.
      const extracted = new turndown().turndown($.html());
      await enqueueLinks({
        // globs: [`"https://docs.dust.tt/*`"],
      });

      const folders = getAllFoldersForUrl(request.url);
      console.log("getting folders for url", folders, request.url);
      for (const folder of folders) {
        console.log("working with folder:", folder);
        // if (createdFolders.has(folder)) {
        //   continue;
        // }
        await WebCrawlerFolder.upsert({
          url: folder,
          parentUrl: folder.split("/").slice(0, -1).join("/"),
          connectorId: connector.id,
          webcrawlerConfigurationId: 2,
        });
        createdFolders.add(folder);
      }

      // await upsertToDatasource({
      //   dataSourceConfig,
      //   documentId: encodeURIComponent(request.url),
      //   documentContent: {
      //     prefix: null,
      //     content: extracted,
      //     sections: [],
      //   },
      //   documentUrl: request.url,
      //   timestampMs: new Date().getTime(),
      //   tags: [],
      //   parents: [],
      //   upsertContext: {
      //     sync_type: "batch",
      //   },
      // });
      pageCount++;
    },
    failedRequestHandler: async () => {
      errorCount++;
    },
  });

  // Start the crawler and wait for it to finish

  await crawler.run();

  return {
    pageCount,
    errorCount,
  };
}

export function getAllFoldersForUrl(url: string) {
  const parsed = new URL(url);
  const urlParts = parsed.pathname.split("/").filter((part) => part.length > 0);
  const folders: string[] = [];
  for (let i = 0; i < urlParts.length; i++) {
    folders.push(`${parsed.origin}/${urlParts.slice(0, i + 1).join("/")}`);
  }
  if (folders.length === 0) {
    folders.push(`${parsed.origin}/`);
  }
  return folders;
}
