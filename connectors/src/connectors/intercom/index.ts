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
  getHelpCenterArticleIdFromInternalId,
  getHelpCenterArticleInternalId,
  getHelpCenterCollectionIdFromInternalId,
  getHelpCenterCollectionInternalId,
  getHelpCenterIdFromInternalId,
  getHelpCenterInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import {
  launchIntercomSyncWorkflow,
  stopIntercomSyncWorkflow,
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

    await launchIntercomSyncWorkflow(connector.id);
    return new Ok(connector.id.toString());
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
  const res = await stopIntercomSyncWorkflow(connectorId);
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
    await launchIntercomSyncWorkflow(connector.id);
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

async function startWorkflowIfNecessary(
  helpCenterIds: string[],
  workflowLauncher: (
    connectorId: ModelId,
    helpCenterIds: string[]
  ) => Promise<Result<string, Error>>,
  connectorId: ModelId
): Promise<Result<void, Error>> {
  if (helpCenterIds.length > 0) {
    const workflowStarted = await workflowLauncher(connectorId, helpCenterIds);
    if (workflowStarted.isErr()) {
      return new Err(workflowStarted.error);
    }
  }
  return new Ok(undefined);
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
  const toBeSignaledHelpCenterIds = new Set<string>();
  try {
    for (const [id, permission] of Object.entries(permissions)) {
      if (permission !== "none" && permission !== "read") {
        return new Err(
          new Error(
            `Invalid permission ${permission} for connector ${connectorId}`
          )
        );
      }

      const helpCenterId = getHelpCenterIdFromInternalId(connectorId, id);
      const collectionId = getHelpCenterCollectionIdFromInternalId(
        connectorId,
        id
      );

      if (helpCenterId) {
        toBeSignaledHelpCenterIds.add(helpCenterId);
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
      } else if (collectionId) {
        if (permission === "none") {
          const revokedCollection = await revokeSyncCollection({
            connector,
            collectionId,
          });
          if (revokedCollection) {
            toBeSignaledHelpCenterIds.add(revokedCollection.helpCenterId);
          }
        }
        if (permission === "read") {
          const newCollection = await allowSyncCollection({
            connector,
            intercomClient,
            collectionId,
          });
          if (newCollection) {
            toBeSignaledHelpCenterIds.add(newCollection.helpCenterId);
          }
        }
      }
    }

    const sendSignalToWorkflowResult = await startWorkflowIfNecessary(
      [...toBeSignaledHelpCenterIds],
      launchIntercomSyncWorkflow,
      connectorId
    );
    if (sendSignalToWorkflowResult.isErr()) {
      return new Err(sendSignalToWorkflowResult.error);
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
    const helpCenterInternalId = getHelpCenterInternalId(
      connectorId,
      helpCenter.helpCenterId
    );
    titles[helpCenterInternalId] = helpCenter.name;
  }
  for (const collection of collections) {
    const collectionInternalId = getHelpCenterCollectionInternalId(
      connectorId,
      collection.collectionId
    );
    titles[collectionInternalId] = collection.name;
  }
  for (const article of articles) {
    const articleInternalId = getHelpCenterArticleInternalId(
      connectorId,
      article.articleId
    );
    titles[articleInternalId] = article.title;
  }

  return new Ok(titles);
}

export async function retrieveIntercomObjectsParents(
  connectorId: ModelId,
  internalId: string
): Promise<Result<string[], Error>> {
  const helpCenterId = getHelpCenterIdFromInternalId(connectorId, internalId);
  if (helpCenterId) {
    return new Ok([]);
  }

  const parents: string[] = [];
  let collection = null;

  const collectionId = getHelpCenterCollectionIdFromInternalId(
    connectorId,
    internalId
  );
  const articleId = getHelpCenterArticleIdFromInternalId(
    connectorId,
    internalId
  );

  if (collectionId) {
    collection = await IntercomCollection.findOne({
      where: {
        connectorId,
        collectionId,
      },
    });
  } else if (articleId) {
    const article = await IntercomArticle.findOne({
      where: {
        connectorId,
        articleId,
      },
    });
    if (article && article.parentType === "collection" && article.parentId) {
      parents.push(
        getHelpCenterCollectionInternalId(connectorId, article.parentId)
      );
      collection = await IntercomCollection.findOne({
        where: {
          connectorId: connectorId,
          collectionId: article.parentId,
        },
      });
    }
  }

  if (collection && collection.parentId) {
    parents.push(
      getHelpCenterCollectionInternalId(connectorId, collection.parentId)
    );
    const parentCollection = await IntercomCollection.findOne({
      where: {
        connectorId: connectorId,
        collectionId: collection.parentId,
      },
    });
    if (parentCollection && parentCollection.parentId) {
      parents.push(
        getHelpCenterCollectionInternalId(
          connectorId,
          parentCollection.parentId
        )
      );
    }
    // we can stop here as Intercom has max 3 levels of collections
  }

  if (collection && collection.helpCenterId) {
    parents.push(getHelpCenterInternalId(connectorId, collection.helpCenterId));
  }

  return new Ok(parents);
}
