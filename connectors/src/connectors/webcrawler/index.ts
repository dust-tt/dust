import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
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
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  WebCrawlerConfigurationType,
} from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import {
  DepthOptions,
  isDepthOption,
  MIME_TYPES,
  WEBCRAWLER_MAX_PAGES,
  WebCrawlerHeaderRedactedValue,
} from "@connectors/types";

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
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
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
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    const webCrawlerConfig =
      await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

    if (!webCrawlerConfig) {
      throw new Error("Webcrawler configuration not found");
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
            internalId: folder.internalId,
            parentInternalId: folder.parentUrl
              ? stableIdForUrl({
                  url: folder.parentUrl,
                  ressourceType: "folder",
                })
              : null,
            title: getDisplayNameForFolder(folder),
            sourceUrl: folder.url,
            expandable: true,
            permission: "read",
            type: "folder",
            lastUpdatedAt: folder.updatedAt.getTime(),
            mimeType: MIME_TYPES.WEBCRAWLER.FOLDER,
          };
        })
        .concat(
          pages.map((page): ContentNode => {
            const isFileAndFolder = excludedFoldersSet.has(
              normalizeFolderUrl(page.url)
            );
            return {
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
              type: "document",
              lastUpdatedAt: page.updatedAt.getTime(),
              mimeType: "text/html",
            };
          })
        )
        .sort((a, b) => a.title.localeCompare(b.title))
    );
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    // This isn't used for webcrawler.
    return new Ok([internalId]);
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

  async update(): Promise<
    Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>
  > {
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
