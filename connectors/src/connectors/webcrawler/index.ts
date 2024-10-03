import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  Result,
  WebCrawlerConfigurationType,
} from "@dust-tt/types";
import {
  DepthOptions,
  Err,
  isDepthOption,
  Ok,
  WEBCRAWLER_MAX_PAGES,
  WebCrawlerHeaderRedactedValue,
} from "@dust-tt/types";

import {
  getDisplayNameForFolder,
  getDisplayNameForPage,
  normalizeFolderUrl,
  stableIdForUrl,
} from "@connectors/connectors/webcrawler/lib/utils";
import {
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

import type { ConnectorManagerError } from "../interface";
import { BaseConnectorManager } from "../interface";
import {
  launchCrawlWebsiteWorkflow,
  stopCrawlWebsiteWorkflow,
} from "./temporal/client";

export class WebcrawlerConnectorManager extends BaseConnectorManager<WebCrawlerConfigurationType> {
  static async create({
    dataSourceConfig,
    configuration,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
    configuration: WebCrawlerConfigurationType;
  }): Promise<Result<string, ConnectorManagerError>> {
    if (!configuration) {
      throw new Error("Configuration is required");
    }
    const depth = configuration.depth;
    if (!isDepthOption(depth)) {
      throw new Error("Invalid depth option");
    }
    if (configuration.maxPageToCrawl > WEBCRAWLER_MAX_PAGES) {
      throw new Error(`Maximum value for Max Page is ${WEBCRAWLER_MAX_PAGES}`);
    }
    const url = configuration.url.trim();
    const webCrawlerConfigurationBlob = {
      url,
      maxPageToCrawl: configuration.maxPageToCrawl,
      crawlMode: configuration.crawlMode,
      depth: depth,
      crawlFrequency: configuration.crawlFrequency,
      lastCrawledAt: null,
      headers: configuration.headers,
    };

    const connector = await ConnectorResource.makeNew(
      "webcrawler",
      {
        connectionId: configuration.url,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      webCrawlerConfigurationBlob
    );

    const workflowRes = await launchCrawlWebsiteWorkflow(connector.id);
    if (workflowRes.isErr()) {
      throw workflowRes.error;
    }
    logger.info(
      { connectorId: connector.id },
      `Launched crawl website workflow for connector`
    );

    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error("Connector not found.");
    }

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Webcrawler connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    const res = await stopCrawlWebsiteWorkflow(this.connectorId);
    if (res.isErr()) {
      return res;
    }

    return new Ok(undefined);
  }

  async sync(): Promise<Result<string, Error>> {
    return launchCrawlWebsiteWorkflow(this.connectorId);
  }

  async retrievePermissions({
    parentInternalId,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(new Error("Connector not found"));
    }

    const webCrawlerConfig =
      await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

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
        logger.error(
          {
            connectorId: connector.id,
            parentInternalId,
          },
          "Webcrawler: Parent not found"
        );
        return new Ok([]);
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
        .map((folder): ContentNode => {
          return {
            provider: "webcrawler",
            internalId: folder.internalId,
            parentInternalId: folder.parentUrl
              ? stableIdForUrl({
                  url: folder.parentUrl,
                  ressourceType: "folder",
                })
              : null,
            title: getDisplayNameForFolder(folder),
            sourceUrl: null,
            expandable: true,
            permission: "read",
            dustDocumentId: null,
            type: "folder",
            lastUpdatedAt: folder.updatedAt.getTime(),
          };
        })
        .concat(
          pages.map((page): ContentNode => {
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
              title: getDisplayNameForPage(page),
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

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const nodes: ContentNode[] = [];

    const [folders, pages] = await Promise.all([
      WebCrawlerFolder.findAll({
        where: {
          connectorId: this.connectorId,
          internalId: internalIds,
        },
      }),
      WebCrawlerPage.findAll({
        where: {
          connectorId: this.connectorId,
          documentId: internalIds,
        },
      }),
    ]);

    folders.forEach((folder) => {
      nodes.push({
        provider: "webcrawler",
        internalId: folder.internalId,
        parentInternalId: folder.parentUrl,
        title: getDisplayNameForFolder(folder),
        sourceUrl: folder.url,
        expandable: true,
        permission: "read",
        dustDocumentId: null,
        type: "folder",
        lastUpdatedAt: folder.updatedAt.getTime(),
      });
    });
    pages.forEach((page) => {
      nodes.push({
        provider: "webcrawler",
        internalId: page.documentId,
        parentInternalId: page.parentUrl,
        title: getDisplayNameForPage(page),
        sourceUrl: page.url,
        expandable: false,
        permission: "read",
        dustDocumentId: page.documentId,
        type: "file",
        lastUpdatedAt: page.updatedAt.getTime(),
      });
    });

    return new Ok(nodes);
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    const parents: string[] = [internalId];
    let parentUrl: string | null = null;

    // First we get the Page or Folder for which we want to retrieve the parents
    const page = await WebCrawlerPage.findOne({
      where: {
        connectorId: this.connectorId,
        documentId: internalId,
      },
    });
    if (page && page.parentUrl) {
      parentUrl = page.parentUrl;
    } else {
      const folder = await WebCrawlerFolder.findOne({
        where: {
          connectorId: this.connectorId,
          internalId: internalId,
        },
      });
      if (folder && folder.parentUrl) {
        parentUrl = folder.parentUrl;
      }
    }

    // If the Page or Folder has no parentUrl, we return an empty array
    if (!parentUrl) {
      return new Ok(parents);
    }

    // Otherwise we loop on the parentUrl to retrieve all the parents
    const visitedUrls = new Set<string>();
    while (parentUrl) {
      const parentFolder: WebCrawlerFolder | null =
        await WebCrawlerFolder.findOne({
          where: {
            connectorId: this.connectorId,
            url: parentUrl,
          },
        });

      if (!parentFolder) {
        parentUrl = null;
        continue;
      }

      if (visitedUrls.has(parentFolder.url)) {
        logger.error(
          {
            connectorId: this.connectorId,
            internalId,
            parents,
          },
          "Found a cycle in the parents tree"
        );
        parentUrl = null;
        continue;
      }
      parents.push(parentFolder.internalId);
      visitedUrls.add(parentFolder.url);
      parentUrl = parentFolder.parentUrl;
    }

    return new Ok(parents);
  }

  async pause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error("Connector not found.");
    }
    await connector.markAsPaused();
    const stopRes = await stopCrawlWebsiteWorkflow(this.connectorId);
    if (stopRes.isErr()) {
      return stopRes;
    }
    return new Ok(undefined);
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error("Connector not found.");
    }
    await connector.markAsUnpaused();

    const r = await this.resume();
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  async configure({
    configuration,
  }: {
    configuration: WebCrawlerConfigurationType;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(new Error("Connector not found"));
    }
    const depth = configuration.depth;
    if (!isDepthOption(depth)) {
      return new Err(
        new Error(
          `Invalid depth option. Expected one of: (${DepthOptions.join(",")})`
        )
      );
    }

    if (configuration.maxPageToCrawl > WEBCRAWLER_MAX_PAGES) {
      return new Err(
        new Error(`Maximum value for Max Page is ${WEBCRAWLER_MAX_PAGES}`)
      );
    }
    const webcrawlerConfig =
      await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

    if (!webcrawlerConfig) {
      return new Err(
        new Error(`Webcrawler configuration not found for ${this.connectorId}`)
      );
    }
    await webcrawlerConfig.update({
      url: configuration.url,
      maxPageToCrawl: configuration.maxPageToCrawl,
      crawlMode: configuration.crawlMode,
      depth: depth,
      crawlFrequency: configuration.crawlFrequency,
    });
    const existingHeaders = webcrawlerConfig.getCustomHeaders();
    const headersForUpdate: Record<string, string> = {};
    for (const [key, value] of Object.entries(configuration.headers)) {
      if (value !== WebCrawlerHeaderRedactedValue) {
        // If the value is not redacted, we use the new value.
        headersForUpdate[key] = value;
      } else {
        // If the value is redacted, we use the existing value from
        // the database.
        const existingValue = existingHeaders[key];
        if (existingValue) {
          headersForUpdate[key] = existingValue;
        }
      }
    }

    await webcrawlerConfig.setCustomHeaders(headersForUpdate);

    const stopRes = await stopCrawlWebsiteWorkflow(connector.id);
    if (stopRes.isErr()) {
      return new Err(stopRes.error);
    }

    const startRes = await launchCrawlWebsiteWorkflow(connector.id);
    if (startRes.isErr()) {
      return new Err(startRes.error);
    }

    return new Ok(undefined);
  }

  async update(): Promise<Result<string, ConnectorsAPIError>> {
    throw new Error("Method not implemented.");
  }

  async resume(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      throw new Error("Connector not found.");
    }

    const startRes = await launchCrawlWebsiteWorkflow(this.connectorId);
    if (startRes.isErr()) {
      return startRes;
    }
    return new Ok(undefined);
  }

  async setPermissions(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }

  async getConfigurationKey(): Promise<Result<string | null, Error>> {
    throw new Error("Method not implemented.");
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }
}
