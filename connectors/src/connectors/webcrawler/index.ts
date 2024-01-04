import { ConnectorResource } from "@dust-tt/types";

import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  WebCrawlerConfiguration,
  WebCrawlerFolder,
} from "@connectors/lib/models/webcrawler";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

import { ConnectorPermissionRetriever } from "../interface";
import { getFolderForUrl } from "./temporal/activities";

export async function createWebcrawlerConnector(
  dataSourceConfig: DataSourceConfig
): Promise<Result<string, Error>> {
  const res = await sequelize_conn.transaction(
    async (t): Promise<Result<Connector, Error>> => {
      const connector = await Connector.create(
        {
          type: "webcrawler",
          connectionId: null,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction: t }
      );

      return new Ok(connector);
    }
  );

  if (res.isErr()) {
    return res;
  }

  return new Ok(res.value.id.toString());
}

export async function retrieveWebcrawlerConnectorPermissions({
  connectorId,
  parentInternalId,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorResource[], Error>
> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }

  const webCrawlerConfig = await WebCrawlerConfiguration.findOne({
    where: { connectorId: connector.id },
  });
  if (!webCrawlerConfig) {
    return new Err(new Error("Webcrawler configuration not found"));
  }
  const parentId =
    parentInternalId ??
    (getFolderForUrl(webCrawlerConfig.url) || webCrawlerConfig.url);
  const folders = await WebCrawlerFolder.findAll({
    where: {
      connectorId: connector.id,
      webcrawlerConfigurationId: webCrawlerConfig.id,
      parentUrl: parentId,
    },
  });

  return new Ok(
    folders
      .map((folder): ConnectorResource => {
        return {
          provider: "webcrawler",
          internalId: folder.url,
          parentInternalId: folder.parentUrl,
          type: folder.ressourceType,
          title: folder.url,
          sourceUrl: folder.ressourceType === "file" ? folder.url : null,
          expandable: folder.ressourceType === "folder",
          permission: "read",
          dustDocumentId: folder.dustDocumentId,
          lastUpdatedAt: folder.updatedAt.getTime(),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  );
}
