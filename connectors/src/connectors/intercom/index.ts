import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Op } from "sequelize";

import {
  allowSyncCollection,
  allowSyncHelpCenter,
  retrieveIntercomHelpCentersPermissions,
  revokeSyncCollection,
  revokeSyncHelpCenter,
} from "@connectors/connectors/intercom/lib/help_center_permissions";
import {
  fetchIntercomWorkspaceId,
  getIntercomClient,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  launchIntercomHelpCentersSyncWorkflow,
  stopIntercomHelpCentersSyncWorkflow,
} from "@connectors/connectors/intercom/temporal/client";
import type { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  IntercomArticle,
  IntercomCollection,
  IntercomHelpCenter,
} from "@connectors/lib/models/intercom";
import { nangoDeleteConnection } from "@connectors/lib/nango_client";
import { Err, Ok } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { NangoConnectionId } from "@connectors/types/nango_connection_id";
import type { ConnectorResource } from "@connectors/types/resources";

const { NANGO_INTERCOM_CONNECTOR_ID } = process.env;

export async function createIntercomConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  const nangoConnectionId = connectionId;

  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_INTERCOM_CONNECTOR_ID not set");
  }

  try {
    const connector = await Connector.create({
      type: "intercom",
      connectionId: nangoConnectionId,
      workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    });

    const connectorIdAsString = connector.id.toString();
    await launchIntercomHelpCentersSyncWorkflow(connectorIdAsString);

    return new Ok(connectorIdAsString);
  } catch (e) {
    logger.error({ error: e }, "[Intercom] Error creating connector.");
    return new Err(e as Error);
  }
}

export async function updateIntercomConnector(
  connectorId: ModelId,
  {
    connectionId,
  }: {
    connectionId?: NangoConnectionId | null;
  }
): Promise<Result<string, ConnectorsAPIError>> {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_INTERCOM_CONNECTOR_ID not set");
  }

  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Intercom] Connector not found.");
    return new Err({
      message: "Connector not found",
      type: "connector_not_found",
    });
  }

  if (connectionId) {
    const oldConnectionId = connector.connectionId;
    const oldIntercomWorkspaceId = await fetchIntercomWorkspaceId(
      oldConnectionId
    );

    const newConnectionId = connectionId;
    const newIntercomWorkspaceId = await fetchIntercomWorkspaceId(
      newConnectionId
    );

    if (!oldIntercomWorkspaceId || !newIntercomWorkspaceId) {
      return new Err({
        type: "connector_update_error",
        message: "Error retrieving nango connection info to update connector",
      });
    }
    if (oldIntercomWorkspaceId !== newIntercomWorkspaceId) {
      nangoDeleteConnection(newConnectionId, NANGO_INTERCOM_CONNECTOR_ID).catch(
        (e) => {
          logger.error(
            { error: e, oldConnectionId },
            "Error deleting old Nango connection"
          );
        }
      );
      return new Err({
        type: "connector_oauth_target_mismatch",
        message: "Cannot change workspace of a Notion connector",
      });
    }

    await connector.update({
      connectionId: newConnectionId,
    });
    nangoDeleteConnection(oldConnectionId, NANGO_INTERCOM_CONNECTOR_ID).catch(
      (e) => {
        logger.error(
          { error: e, oldConnectionId },
          "Error deleting old Nango connection"
        );
      }
    );
  }
  return new Ok(connector.id.toString());
}

export async function cleanupIntercomConnector(
  connectorId: string
): Promise<Result<void, Error>> {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("INTERCOM_NANGO_CONNECTOR_ID not set");
  }

  const connector = await Connector.findOne({
    where: { type: "intercom", id: connectorId },
  });
  if (!connector) {
    logger.error({ connectorId }, "Intercom connector not found.");
    return new Err(new Error("Connector not found"));
  }

  return sequelize_conn.transaction(async (transaction) => {
    await Promise.all([
      IntercomHelpCenter.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction: transaction,
      }),
      IntercomCollection.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction: transaction,
      }),
      IntercomArticle.destroy({
        where: {
          connectorId: connector.id,
        },
        transaction: transaction,
      }),
    ]);

    const nangoRes = await nangoDeleteConnection(
      connector.connectionId,
      NANGO_INTERCOM_CONNECTOR_ID
    );
    if (nangoRes.isErr()) {
      throw nangoRes.error;
    }

    await connector.destroy({
      transaction: transaction,
    });

    return new Ok(undefined);
  });
}

export async function stopIntercomConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  const res = await stopIntercomHelpCentersSyncWorkflow(connectorId);
  if (res.isErr()) {
    return res;
  }

  return new Ok(connectorId);
}

export async function resumeIntercomConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Intercom] Connector not found.");
    return new Err(new Error("Connector not found"));
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  try {
    await launchIntercomHelpCentersSyncWorkflow(connectorId);
  } catch (e) {
    logger.error(
      {
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
        error: e,
      },
      "Error launching Intercom sync workflow."
    );
  }

  return new Ok(connector.id.toString());
}

export async function retrieveIntercomConnectorPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorResource[], Error>
> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Intercom] Connector not found.");
    return new Err(new Error("Connector not found"));
  }

  try {
    const resources = await retrieveIntercomHelpCentersPermissions({
      connectorId,
      parentInternalId,
      filterPermission,
    });
    return new Ok(resources);
  } catch (e) {
    return new Err(e as Error);
  }
}

export async function setIntercomConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Intercom] Connector not found.");
    return new Err(new Error("Connector not found"));
  }

  const intercomClient = await getIntercomClient(connector.connectionId);
  try {
    for (const [id, permission] of Object.entries(permissions)) {
      if (permission !== "none" && permission !== "read") {
        return new Err(
          new Error(
            `Invalid permission ${permission} for connector ${connectorId}`
          )
        );
      }
      if (id.startsWith("help_center_")) {
        const helpCenterId = id.replace("help_center_", "");
        if (permission === "none") {
          await revokeSyncHelpCenter({
            connector,
            intercomClient,
            helpCenterId,
          });
        }
        if (permission === "read") {
          await allowSyncHelpCenter({
            connector,
            intercomClient,
            helpCenterId,
            withChildren: true,
          });
        }
      } else if (id.startsWith("collection_")) {
        const collectionId = id.replace("collection_", "");
        if (permission === "none") {
          await revokeSyncCollection({
            connector,
            collectionId,
          });
        }
        if (permission === "read") {
          await allowSyncCollection({
            connector,
            intercomClient,
            collectionId,
          });
        }
      }
    }
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        connectorId: connectorId,
        error: e,
      },
      "Error setting connector permissions."
    );
    return new Err(new Error("Error setting permissions"));
  }
}

export async function retrieveIntercomResourcesTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string | null>, Error>> {
  const [helpCenters, collections, articles] = await Promise.all([
    IntercomHelpCenter.findAll({
      where: {
        connectorId: connectorId,
        helpCenterId: {
          [Op.in]: internalIds,
        },
      },
    }),
    IntercomCollection.findAll({
      where: {
        connectorId: connectorId,
        collectionId: {
          [Op.in]: internalIds,
        },
      },
    }),
    IntercomArticle.findAll({
      where: {
        connectorId: connectorId,
        articleId: {
          [Op.in]: internalIds,
        },
      },
    }),
  ]);

  const titles: Record<string, string> = {};
  for (const helpCenter of helpCenters) {
    titles[`help_center_${helpCenter.helpCenterId}`] = helpCenter.name;
  }
  0;
  for (const collection of collections) {
    titles[`collection_${collection.collectionId}`] = collection.name;
  }
  for (const article of articles) {
    titles[`article_${article.articleId}`] = article.title;
  }

  return new Ok(titles);
}

export async function retrieveIntercomObjectsParents(
  connectorId: ModelId,
  internalId: string
): Promise<Result<string[], Error>> {
  if (internalId.startsWith("help_center_")) {
    return new Ok([]);
  }

  const parents: string[] = [];
  let collection = null;

  if (internalId.startsWith("collection_")) {
    collection = await IntercomCollection.findOne({
      where: {
        connectorId: connectorId,
        collectionId: internalId.replace("collection_", ""),
      },
    });
  } else if (internalId.startsWith("article_")) {
    const article = await IntercomArticle.findOne({
      where: {
        connectorId: connectorId,
        articleId: internalId.replace("article_", ""),
      },
    });
    if (article && article.parentType === "collection" && article.parentId) {
      parents.push(`collection_${article.parentId}`);
      collection = await IntercomCollection.findOne({
        where: {
          connectorId: connectorId,
          collectionId: article.parentId,
        },
      });
    }
  }

  if (collection && collection.parentId) {
    parents.push(`collection_${collection.parentId}`);
    const parentCollection = await IntercomCollection.findOne({
      where: {
        connectorId: connectorId,
        collectionId: collection.parentId,
      },
    });
    if (parentCollection && parentCollection.parentId) {
      parents.push(`collection_${parentCollection.parentId}`);
    }
    // we can stop here as Intercom has max 3 levels of collections
  }

  if (collection && collection.helpCenterId) {
    parents.push(`help_center_${collection.helpCenterId}`);
  }

  return new Ok(parents);
}
