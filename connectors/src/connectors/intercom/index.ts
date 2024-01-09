import { ConnectorPermission, ModelId } from "@dust-tt/types";
import { Op } from "sequelize";

import {
  fetchIntercomCollections,
  fetchIntercomHelpCenters,
  fetchIntercomWorkspaceId,
  getIntercomClient,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  upsertCollectionPermission,
  upsertHelpCenterPermission,
} from "@connectors/connectors/intercom/lib/upsert_permission";
import { launchIntercomHelpCentersSyncWorkflow } from "@connectors/connectors/intercom/temporal/client";
import { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  IntercomArticle,
  IntercomCollection,
  IntercomHelpCenter,
} from "@connectors/lib/models/intercom";
import { nangoDeleteConnection } from "@connectors/lib/nango_client";
import { Err, Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";
import { NangoConnectionId } from "@connectors/types/nango_connection_id";
import { ConnectorResource } from "@connectors/types/resources";

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

    await launchIntercomHelpCentersSyncWorkflow({
      connectorId: connector.id,
      startFromTs: connector.lastSyncSuccessfulTime
        ? connector.lastSyncStartTime?.getTime()
        : null,
    });

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
): Promise<Result<string, ConnectorsAPIErrorResponse>> {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_INTERCOM_CONNECTOR_ID not set");
  }

  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err({
      error: {
        message: "Connector not found",
        type: "connector_not_found",
      },
    });
  }

  if (connectionId) {
    const oldConnectionId = c.connectionId;
    const oldIntercomWorkspaceId = await fetchIntercomWorkspaceId(
      oldConnectionId
    );

    const newConnectionId = connectionId;
    const newIntercomWorkspaceId = await fetchIntercomWorkspaceId(
      newConnectionId
    );

    if (!oldIntercomWorkspaceId || !newIntercomWorkspaceId) {
      return new Err({
        error: {
          type: "connector_update_error",
          message: "Error retrieving nango connection info to update connector",
        },
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
        error: {
          type: "connector_oauth_target_mismatch",
          message: "Cannot change workspace of a Notion connector",
        },
      });
    }

    await c.update({
      connectionId: newConnectionId,
      workspaceId: newIntercomWorkspaceId,
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
  return new Ok(c.id.toString());
}

export async function cleanupIntercomConnector(
  connectorId: string
): Promise<Result<void, Error>> {
  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("INTERCOM_NANGO_CONNECTOR_ID not set");
  }

  return sequelize_conn.transaction(async (transaction) => {
    const connector = await Connector.findOne({
      where: { type: "intercom", id: connectorId },
      transaction: transaction,
    });

    if (!connector) {
      logger.error({ connectorId }, "Intercom connector not found.");
      return new Err(new Error("Connector not found"));
    }

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
  const connector = await Connector.findByPk(connectorId);

  if (!connector) {
    logger.error({ connectorId }, "Intercom connector not found.");
    return new Err(new Error("Connector not found"));
  }

  try {
    await launchIntercomHelpCentersSyncWorkflow({
      connectorId: connector.id,
    });
  } catch (e) {
    logger.error(
      {
        connectorId: connector.id,
        error: e,
      },
      "Error stopping Intercom sync workflow"
    );

    return new Err(e as Error);
  }

  return new Ok(connector.id.toString());
}

export async function resumeIntercomConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  const connector = await Connector.findByPk(connectorId);

  if (!connector) {
    logger.error(
      {
        connectorId: connectorId,
      },
      "Notion connector not found."
    );
    return new Err(new Error("Connector not found"));
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  try {
    await launchIntercomHelpCentersSyncWorkflow({
      connectorId: connector.id,
      startFromTs: connector.lastSyncSuccessfulTime
        ? connector.lastSyncStartTime?.getTime()
        : null,
    });
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

export async function fullResyncIntercomConnector(
  connectorId: string,
  fromTs: number | null
): Promise<Result<string, Error>> {
  const connector = await Connector.findOne({
    where: { type: "notion", id: connectorId },
  });

  if (!connector) {
    logger.error({ connectorId }, "Notion connector not found.");
    return new Err(new Error("Connector not found"));
  }

  try {
    await stopIntercomConnector(connector.id.toString());
  } catch (e) {
    logger.error(
      {
        connectorId,
        workspaceId: connector.workspaceId,
        dataSourceName: connector.dataSourceName,
        e,
      },
      "Error stopping notion sync workflow."
    );

    return new Err(e as Error);
  }

  try {
    await launchIntercomHelpCentersSyncWorkflow({
      connectorId: connector.id,
      startFromTs: fromTs,
      forceResync: true,
    });
  } catch (e) {
    logger.error(
      {
        connectorId,
        workspaceId: connector.workspaceId,
        dataSourceName: connector.dataSourceName,
        error: e,
      },
      "Error launching notion sync workflow."
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
  const c = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }

  const intercomClient = await getIntercomClient(c.connectionId);
  const isReadPermissionsOnly = filterPermission === "read";
  const isRootLevel = !parentInternalId;
  let resources: ConnectorResource[] = [];

  // If Root level we retrieve the list of Help Centers.
  // If isReadPermissionsOnly = true, we retrieve the list of Help Centers from DB that have permission = "read"
  // If isReadPermissionsOnly = false, we retrieve the list of Help Centers from Intercom
  if (isRootLevel) {
    if (isReadPermissionsOnly) {
      const helpCentersFromDb = await IntercomHelpCenter.findAll({
        where: {
          connectorId: connectorId,
          permission: "read",
        },
      });
      resources = helpCentersFromDb.map((helpCenter) => ({
        provider: c.type,
        internalId: `help_center_${helpCenter.helpCenterId}`,
        parentInternalId: null,
        type: "database",
        title: helpCenter.name,
        sourceUrl: null,
        expandable: true,
        permission: helpCenter.permission,
        dustDocumentId: null,
        lastUpdatedAt: null,
      }));
    } else {
      const helpCenters = await fetchIntercomHelpCenters(c.connectionId);
      resources = helpCenters.map((helpCenter) => ({
        provider: c.type,
        internalId: `help_center_${helpCenter.id}`,
        parentInternalId: null,
        type: "database",
        title: helpCenter.display_name,
        sourceUrl: null,
        expandable: true,
        permission: "none",
        dustDocumentId: null,
        lastUpdatedAt: null,
      }));
    }
    resources.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
    return new Ok(resources);
  }

  const isParentHelpCenter = parentInternalId.startsWith("help_center_");
  const isParentCollection = parentInternalId.startsWith("collection_");
  const helpCenterParentId = isParentHelpCenter
    ? parentInternalId.replace("help_center_", "")
    : null;
  const collectionParentId = isParentCollection
    ? parentInternalId.replace("collection_", "")
    : null;
  const parentId = isParentHelpCenter ? null : collectionParentId;

  // If parent is a Help Center we retrieve the list of Collections that have parent = null
  // If isReadPermissionsOnly = true, we retrieve the list of Collections from DB that have permission = "read" & no parent
  // If isReadPermissionsOnly = false, we retrieve the list of Help Centers + Articles from Intercom that have no parents
  if (helpCenterParentId) {
    const collectionsInDb = await IntercomCollection.findAll({
      where: {
        connectorId: connectorId,
        helpCenterId: helpCenterParentId,
        parentId,
        permission: "read",
      },
    });
    if (isReadPermissionsOnly) {
      resources = collectionsInDb.map((collection) => ({
        provider: c.type,
        internalId: `collection_${collection.collectionId}`,
        parentInternalId: collection.parentId
          ? `collection_${collection.parentId}`
          : null,
        type: "folder",
        title: collection.name,
        sourceUrl: collection.url,
        expandable: true,
        permission: collection.permission,
        dustDocumentId: null,
        lastUpdatedAt: collection.lastUpsertedTs?.getTime() || null,
      }));
    } else {
      const collectionsInIntercom = await fetchIntercomCollections(
        intercomClient,
        helpCenterParentId,
        parentId
      );
      resources = collectionsInIntercom.map((collection) => {
        const matchingCollectionInDb = collectionsInDb.find(
          (c) => c.collectionId === collection.id
        );
        return {
          provider: c.type,
          internalId: `collection_${collection.id}`,
          parentInternalId: collection.parent_id
            ? `collection_${collection.parent_id}`
            : null,
          type: "folder",
          title: collection.name,
          sourceUrl: collection.url,
          expandable: false, // WE DO NOT LET EXPAND BELOW LEVEL 1 WHEN SELECTING RESOURCES
          permission: matchingCollectionInDb ? "read" : "none",
          dustDocumentId: null,
          lastUpdatedAt:
            matchingCollectionInDb?.lastUpsertedTs?.getTime() || null,
        };
      });
    }
    resources.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
    return new Ok(resources);
  }

  // If parent is a Collection we retrieve the list of Collections & articles that have this parent.
  // If isReadPermissionsOnly = true, we retrieve the list of Collections from DB that have permission = "read" & no parent
  // If isReadPermissionsOnly = false, we retrieve the list of Help Centers + Articles from Intercom that have no parents
  if (collectionParentId) {
    if (isReadPermissionsOnly) {
      const collectionsInDb = await IntercomCollection.findAll({
        where: {
          connectorId: connectorId,
          parentId,
          permission: "read",
        },
      });
      const collectionResources: ConnectorResource[] = collectionsInDb.map(
        (collection) => ({
          provider: c.type,
          internalId: `collection_${collection.collectionId}`,
          parentInternalId: collection.parentId
            ? `collection_${collection.parentId}`
            : null,
          type: "folder",
          title: collection.name,
          sourceUrl: collection.url,
          expandable: true,
          permission: collection.permission,
          dustDocumentId: null,
          lastUpdatedAt: collection.lastUpsertedTs?.getTime() || null,
        })
      );

      const articlesInDb = await IntercomArticle.findAll({
        where: {
          connectorId: connectorId,
          parentId,
          permission: "read",
        },
      });
      const articleResources: ConnectorResource[] = articlesInDb.map(
        (article) => ({
          provider: c.type,
          internalId: `article_${article.articleId}`,
          parentInternalId: article.parentId
            ? `article_${article.parentId}`
            : null,
          type: "file",
          title: article.title,
          sourceUrl: article.url,
          expandable: false,
          permission: article.permission,
          dustDocumentId: null,
          lastUpdatedAt: article.lastUpsertedTs?.getTime() || null,
        })
      );

      collectionResources.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
      articleResources.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
      resources = [...collectionResources, ...articleResources];
    } else {
      logger.error(
        { connectorId, parentInternalId },
        "Trying to retrieve children of a collection while permissions are limited to level 1 collections only."
      );
    }
    resources.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
    return new Ok(resources);
  }

  return new Ok(resources);
}

export async function setIntercomConnectorPermissions(
  connectorId: ModelId,
  permissions: Record<string, ConnectorPermission>
): Promise<Result<void, Error>> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  const intercomClient = await getIntercomClient(connector.connectionId);

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
      await upsertHelpCenterPermission({
        connector,
        intercomClient,
        helpCenterId,
        permission,
        withChildren: true,
      });
    } else if (id.startsWith("collection_")) {
      const collectionId = id.replace("collection_", "");
      await upsertCollectionPermission({
        connector,
        intercomClient,
        collectionId,
        permission,
      });
    }
  }
  return new Ok(undefined);
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
    titles[helpCenter.helpCenterId] = helpCenter.name;
  }
  for (const collection of collections) {
    titles[collection.collectionId] = collection.name;
  }
  for (const article of articles) {
    titles[article.articleId] = article.title;
  }

  return new Ok(titles);
}

// @todo intercom Daph
export async function retrieveIntercomObjectsParents(
  connectorId: ModelId,
  internalId: string,
  memoizationKey?: string
): Promise<Result<string[], Error>> {
  console.log({ connectorId, internalId, memoizationKey });
  throw new Error("retrieveIntercomObjectsParents Not implemented");
}
