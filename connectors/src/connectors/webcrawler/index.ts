import type {
  ConnectorNode,
  CreateConnectorUrlRequestBody,
  ModelId,
} from "@dust-tt/types";

import {
  getDisplayNameForPage,
  normalizeFolderUrl,
  stableIdForUrl,
} from "@connectors/connectors/webcrawler/lib/utils";
import {
  WebCrawlerConfiguration,
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import type { Result } from "@connectors/lib/result.js";
import { Err, Ok } from "@connectors/lib/result.js";
import logger from "@connectors/logger/logger";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

import type { ConnectorPermissionRetriever } from "../interface";
import {
  launchCrawlWebsiteWorkflow,
  stopCrawlWebsiteWorkflow,
} from "./temporal/client";

export async function createWebcrawlerConnector(
  dataSourceConfig: DataSourceConfig,
  urlConfig: CreateConnectorUrlRequestBody
): Promise<Result<string, Error>> {
  const res = await sequelizeConnection.transaction(
    async (t): Promise<Result<ConnectorModel, Error>> => {
      const connector = await ConnectorModel.create(
        {
          type: "webcrawler",
          connectionId: urlConfig.url,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction: t }
      );

      await WebCrawlerConfiguration.create(
        {
          connectorId: connector.id,
          url: urlConfig.url,
          maxPageToCrawl: urlConfig.maxPages,
          crawlMode: urlConfig.crawlMode,
          depth: urlConfig.depth,
        },
        {
          transaction: t,
        }
      );

      return new Ok(connector);
    }
  );

  if (res.isErr()) {
    return res;
  }

  const workflowRes = await launchCrawlWebsiteWorkflow(res.value.id);
  if (workflowRes.isErr()) {
    return workflowRes;
  }
  logger.info(
    { connectorId: res.value.id },
    `Launched crawl website workflow for connector`
  );

  return new Ok(res.value.id.toString());
}

export async function retrieveWebcrawlerConnectorPermissions({
  connectorId,
  parentInternalId,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorNode[], Error>
> {
  const connector = await ConnectorModel.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }

  const webCrawlerConfig = await WebCrawlerConfiguration.findOne({
    where: { connectorId: connector.id },
  });
  if (!webCrawlerConfig) {
    return new Err(new Error("Webcrawler configuration not found"));
  }
  let parentUrl: string | null = null;
  if (parentInternalId) {
    const parent = await WebCrawlerFolder.findOne({
      where: {
        connectorId: connector.id,
        webcrawlerConfigurationId: webCrawlerConfig.id,
        internalId: parentInternalId,
      },
    });
    if (!parent) {
      return new Err(new Error("Parent not found"));
    }
    parentUrl = parent.url;
  }

  const pages = await WebCrawlerPage.findAll({
    where: {
      connectorId: connector.id,
      webcrawlerConfigurationId: webCrawlerConfig.id,
      parentUrl: parentUrl,
    },
  });

  const folders = await WebCrawlerFolder.findAll({
    where: {
      connectorId: connector.id,
      webcrawlerConfigurationId: webCrawlerConfig.id,
      parentUrl: parentUrl,
    },
  });

  const normalizedPagesSet = new Set(
    pages.map((p) => normalizeFolderUrl(p.url))
  );
  // List of folders that are also pages
  const excludedFoldersSet = new Set(
    folders.map((f) => f.url).filter((f) => normalizedPagesSet.has(f))
  );

  return new Ok(
    folders
      // We don't want to show folders that are also pages.
      .filter((f) => !excludedFoldersSet.has(f.url))
      .map((folder): ConnectorNode => {
        return {
          provider: "webcrawler",
          internalId: folder.internalId,
          parentInternalId: folder.parentUrl
            ? stableIdForUrl({
                url: folder.parentUrl,
                ressourceType: "folder",
              })
            : null,
          title:
            new URL(folder.url).pathname
              .split("/")
              .filter((x) => x)
              .pop() || folder.url,
          sourceUrl: null,
          expandable: true,
          permission: "read",
          dustDocumentId: null,
          type: "folder",
          lastUpdatedAt: folder.updatedAt.getTime(),
        };
      })
      .concat(
        pages.map((page): ConnectorNode => {
          const isFileAndFolder = excludedFoldersSet.has(
            normalizeFolderUrl(page.url)
          );
          return {
            provider: "webcrawler",
            internalId: isFileAndFolder
              ? stableIdForUrl({
                  url: normalizeFolderUrl(page.url),
                  ressourceType: "folder",
                })
              : page.documentId,
            parentInternalId: page.parentUrl
              ? stableIdForUrl({
                  url: page.parentUrl,
                  ressourceType: "folder",
                })
              : null,
            title: getDisplayNameForPage(page.url),
            sourceUrl: page.url,
            expandable: isFileAndFolder ? true : false,
            permission: "read",
            dustDocumentId: page.documentId,
            type: "file",
            lastUpdatedAt: page.updatedAt.getTime(),
          };
        })
      )
      .sort((a, b) => a.title.localeCompare(b.title))
  );
}

export async function stopWebcrawlerConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const res = await stopCrawlWebsiteWorkflow(connectorId);
  if (res.isErr()) {
    return res;
  }

  return new Ok(undefined);
}

export async function cleanupWebcrawlerConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  return sequelizeConnection.transaction(async (transaction) => {
    await WebCrawlerPage.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });

    await WebCrawlerFolder.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });
    await WebCrawlerConfiguration.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });
    await ConnectorModel.destroy({
      where: {
        id: connectorId,
      },
      transaction,
    });
    return new Ok(undefined);
  });
}

export async function retrieveWebCrawlerObjectsTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string>, Error>> {
  const googleDriveFiles = await WebCrawlerFolder.findAll({
    where: {
      connectorId: connectorId,
      url: internalIds,
    },
  });

  const titles = googleDriveFiles.reduce((acc, curr) => {
    acc[curr.url] = curr.url;
    return acc;
  }, {} as Record<string, string>);

  return new Ok(titles);
}

export async function retrieveWebCrawlerObjectsParents(
  connectorId: ModelId,
  internalId: string
): Promise<Result<string[], Error>> {
  const parents: string[] = [internalId];
  let ptr = internalId;

  const visited = new Set<string>();

  do {
    const folder = await WebCrawlerFolder.findOne({
      where: {
        connectorId: connectorId,
        url: ptr,
      },
    });
    if (!folder || !folder.parentUrl) {
      return new Ok(parents);
    }

    if (visited.has(folder.parentUrl)) {
      logger.error(
        {
          connectorId,
          internalId,
          parents,
        },
        "Found a cycle in the parents tree"
      );
      return new Ok(parents);
    }
    parents.push(folder.parentUrl);
    ptr = folder.parentUrl;
    visited.add(ptr);
  } while (ptr);

  return new Ok(parents);
}
