import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  ModelId,
} from "@dust-tt/types";
import { Op } from "sequelize";

import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import {
  fetchIntercomCollection,
  fetchIntercomCollections,
  fetchIntercomHelpCenter,
  fetchIntercomHelpCenters,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  getCollectionInAppUrl,
  getHelpCenterArticleInternalId,
  getHelpCenterCollectionIdFromInternalId,
  getHelpCenterCollectionInternalId,
  getHelpCenterIdFromInternalId,
  getHelpCenterInternalId,
} from "@connectors/connectors/intercom/lib/utils";
import {
  IntercomArticle,
  IntercomCollection,
  IntercomHelpCenter,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

// A Help Center contains collections and articles:
// - Level 1: Collections (parent_id is null)
// - Level 2: Collections (parent_id is a level 1 collection)
// - Level 3: Collections (parent_id is a level 2 collection)
// Articles can be put in any collection (level 1, 2 or 3), or none. If none we don't sync them.
// On Intercom API:
// - a collection is attached to a helpCenterId and a parent_id (which is a collectionId).
// - an article is attached to an optional parentId (which is a collectionId) and the list of parents are available on parentsId.

/**
 * Mark a help center as permission "read" and all children (collections & articles) if specified.
 */
export async function allowSyncHelpCenter({
  connectorId,
  connectionId,
  helpCenterId,
  region,
  withChildren = false,
}: {
  connectorId: ModelId;
  connectionId: string;
  helpCenterId: string;
  region: string;
  withChildren?: boolean;
}): Promise<IntercomHelpCenter> {
  let helpCenter = await IntercomHelpCenter.findOne({
    where: {
      connectorId,
      helpCenterId,
    },
  });
  const accessToken = await getIntercomAccessToken(connectionId);
  if (helpCenter?.permission === "none") {
    await helpCenter.update({
      permission: "read",
    });
  }
  if (!helpCenter) {
    const helpCenterOnIntercom = await fetchIntercomHelpCenter({
      accessToken,
      helpCenterId,
    });
    if (helpCenterOnIntercom) {
      helpCenter = await IntercomHelpCenter.create({
        connectorId: connectorId,
        helpCenterId: helpCenterOnIntercom.id,
        name: helpCenterOnIntercom.display_name || "Help Center",
        identifier: helpCenterOnIntercom.identifier,
        intercomWorkspaceId: helpCenterOnIntercom.workspace_id,
        websiteTurnedOn: helpCenterOnIntercom.website_turned_on,
        permission: "read",
      });
    }
  }

  if (!helpCenter) {
    logger.error({ helpCenterId }, "[Intercom] Help Center not found.");
    throw new Error("Help Center not found.");
  }

  // If withChildren we are allowing the full Help Center.
  if (withChildren) {
    const level1Collections = await fetchIntercomCollections({
      accessToken,
      helpCenterId: helpCenter.helpCenterId,
      parentId: null,
    });
    const permissionUpdatePromises = level1Collections.map((c1) =>
      allowSyncCollection({
        connectorId,
        connectionId,
        collectionId: c1.id,
        helpCenterId,
        region,
      })
    );
    await Promise.all(permissionUpdatePromises);
  }

  return helpCenter;
}

/**
 * Mark a help center as permission "none" and all children (collections & articles).
 */
export async function revokeSyncHelpCenter({
  connectorId,
  helpCenterId,
}: {
  connectorId: ModelId;
  helpCenterId: string;
}): Promise<IntercomHelpCenter | null> {
  const helpCenter = await IntercomHelpCenter.findOne({
    where: {
      connectorId,
      helpCenterId,
    },
  });

  // Revoke permission for the Help Center
  if (helpCenter?.permission === "read") {
    await helpCenter.update({
      permission: "none",
    });
  }

  // Revoke permission for all collections (level 1, level 2 and level 3)
  await IntercomCollection.update(
    { permission: "none" },
    {
      where: {
        helpCenterId: helpCenterId,
      },
    }
  );

  // Revoke permission for all articles
  const level1Collections = await IntercomCollection.findAll({
    where: {
      helpCenterId: helpCenterId,
      parentId: null,
    },
  });
  await Promise.all(
    level1Collections.map(async (c1) => {
      await IntercomArticle.update(
        { permission: "none" },
        {
          where: {
            parents: {
              [Op.contains]: [c1.collectionId],
            },
          },
        }
      );
    })
  );

  return helpCenter;
}

/**
 * Mark a collection as permission "read" and all children (collections & articles)
 */
export async function allowSyncCollection({
  connectorId,
  connectionId,
  collectionId,
  helpCenterId,
  region,
}: {
  connectorId: ModelId;
  connectionId: string;
  collectionId: string;
  helpCenterId?: string;
  region: string;
}): Promise<IntercomCollection | null> {
  let collection = await IntercomCollection.findOne({
    where: {
      connectorId: connectorId,
      collectionId,
    },
  });
  const accessToken = await getIntercomAccessToken(connectionId);

  if (collection?.permission === "none") {
    await collection.update({
      permission: "read",
    });
  } else if (!collection) {
    const intercomCollection = await fetchIntercomCollection({
      accessToken,
      collectionId,
    });

    const hpId = helpCenterId || intercomCollection?.help_center_id;

    if (intercomCollection && hpId) {
      collection = await IntercomCollection.create({
        connectorId,
        collectionId: intercomCollection.id,
        intercomWorkspaceId: intercomCollection.workspace_id,
        helpCenterId: hpId,
        parentId: intercomCollection.parent_id,
        name: intercomCollection.name,
        description: intercomCollection.description,
        url:
          intercomCollection.url ||
          getCollectionInAppUrl(intercomCollection, region),
        permission: "read",
      });
    }
  }

  if (!collection) {
    logger.error(
      { collectionId },
      "[Intercom] Collection not found in Intercom API."
    );
    throw new Error(" Collection not found.");
  }

  // We create the Help Center if it doesn't exist and fetch the children collections
  const [, childrenCollections] = await Promise.all([
    allowSyncHelpCenter({
      connectorId,
      connectionId,
      helpCenterId: collection.helpCenterId,
      region,
    }),
    fetchIntercomCollections({
      accessToken,
      helpCenterId: collection.helpCenterId,
      parentId: collection.collectionId,
    }),
  ]);

  const collectionPermissionPromises = childrenCollections.map((c) =>
    allowSyncCollection({
      connectorId,
      connectionId,
      collectionId: c.id,
      helpCenterId,
      region,
    })
  );
  await Promise.all(collectionPermissionPromises);

  return collection;
}

/**
 * Mark a collection as permission "none" and all children (collections & articles)
 */
export async function revokeSyncCollection({
  connectorId,
  collectionId,
}: {
  connectorId: ModelId;
  collectionId: string;
}): Promise<IntercomCollection | null> {
  // Revoke permission for this level 1 collection
  const collection = await IntercomCollection.findOne({
    where: {
      connectorId,
      collectionId,
    },
  });

  if (!collection) {
    logger.warn(
      { collectionId },
      "[Intercom] Called revokeSyncCollection on a Collection not found."
    );
    return null;
  }
  if (collection.permission === "none") {
    logger.warn(
      { collectionId },
      "[Intercom] Called revokeSyncCollection on a Collection already set to permission none."
    );
    return null;
  }

  await collection.update({
    permission: "none",
  });

  // Revoke permission for all children collections (level 2 and level 3)
  const level2Collections = await IntercomCollection.findAll({
    where: {
      parentId: collectionId,
    },
  });
  const updatelevel2CollPromises = level2Collections.map((c) =>
    Promise.all([
      IntercomCollection.update(
        { permission: "none" },
        {
          where: {
            parentId: c.collectionId, // this updates the level 3 collections
          },
        }
      ),
      c.update({ permission: "none" }),
    ])
  );
  await Promise.all(updatelevel2CollPromises);

  // Revoke permission for all articles in this collection
  await IntercomArticle.update(
    { permission: "none" },
    {
      where: {
        parents: {
          [Op.contains]: [collectionId],
        },
      },
    }
  );

  // Revoke permission for Help Center if no more collections are allowed
  const level1Collections = await IntercomCollection.findAll({
    where: {
      helpCenterId: collection.helpCenterId,
      parentId: null,
      permission: "read",
    },
  });
  if (level1Collections.length === 0) {
    await revokeSyncHelpCenter({
      connectorId,
      helpCenterId: collection.helpCenterId,
    });
  }

  return collection;
}

export async function retrieveIntercomHelpCentersPermissions({
  connectorId,
  parentInternalId,
  filterPermission,
}: {
  connectorId: ModelId;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
  viewType: ContentNodesViewType;
}): Promise<ContentNode[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "[Intercom] Connector not found.");
    throw new Error("Connector not found");
  }

  const accessToken = await getIntercomAccessToken(connector.connectionId);

  const isReadPermissionsOnly = filterPermission === "read";
  const isRootLevel = !parentInternalId;
  let nodes: ContentNode[] = [];

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
      nodes = helpCentersFromDb.map((helpCenter) => ({
        provider: connector.type,
        internalId: getHelpCenterInternalId(
          connectorId,
          helpCenter.helpCenterId
        ),
        parentInternalId: null,
        type: "database",
        title: helpCenter.name,
        sourceUrl: null,
        expandable: true,
        permission: helpCenter.permission,
        dustDocumentId: null,
        lastUpdatedAt: helpCenter.updatedAt.getTime(),
      }));
    } else {
      const helpCenters = await fetchIntercomHelpCenters({ accessToken });
      nodes = helpCenters.map((helpCenter) => ({
        provider: connector.type,
        internalId: getHelpCenterInternalId(connectorId, helpCenter.id),
        parentInternalId: null,
        type: "database",
        title: helpCenter.display_name || "Help Center",
        sourceUrl: null,
        expandable: true,
        preventSelection: true,
        permission: "none",
        dustDocumentId: null,
        lastUpdatedAt: null,
      }));
    }
    nodes.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
    return nodes;
  }

  const helpCenterParentId = getHelpCenterIdFromInternalId(
    connectorId,
    parentInternalId
  );
  const collectionParentId = getHelpCenterCollectionIdFromInternalId(
    connectorId,
    parentInternalId
  );
  // If parent is a Help Center we retrieve the list of Collections that have parent = null
  const parentId = helpCenterParentId ? null : collectionParentId;

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
      nodes = collectionsInDb.map((collection) => ({
        provider: connector.type,
        internalId: getHelpCenterCollectionInternalId(
          connectorId,
          collection.collectionId
        ),
        parentInternalId: collection.parentId
          ? getHelpCenterCollectionInternalId(connectorId, collection.parentId)
          : null,
        type: "folder",
        title: collection.name,
        sourceUrl: collection.url,
        expandable: true,
        permission: collection.permission,
        dustDocumentId: null,
        lastUpdatedAt: collection.updatedAt.getTime() || null,
      }));
    } else {
      const collectionsInIntercom = await fetchIntercomCollections({
        accessToken,
        helpCenterId: helpCenterParentId,
        parentId,
      });
      nodes = collectionsInIntercom.map((collection) => {
        const matchingCollectionInDb = collectionsInDb.find(
          (c) => c.collectionId === collection.id
        );
        return {
          provider: connector.type,
          internalId: getHelpCenterCollectionInternalId(
            connectorId,
            collection.id
          ),
          parentInternalId: collection.parent_id
            ? getHelpCenterCollectionInternalId(
                connectorId,
                collection.parent_id
              )
            : null,
          type: "folder",
          title: collection.name,
          sourceUrl: collection.url,
          expandable: false, // WE DO NOT LET EXPAND BELOW LEVEL 1 WHEN SELECTING NODES
          permission: matchingCollectionInDb ? "read" : "none",
          dustDocumentId: null,
          lastUpdatedAt: matchingCollectionInDb?.updatedAt.getTime() || null,
        };
      });
    }
    nodes.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
    return nodes;
  }

  // If parent is a Collection we retrieve the list of Collections & articles that have this parent.
  // If isReadPermissionsOnly = true, we retrieve the list of Collections from DB that have permission = "read" & this parent
  // If isReadPermissionsOnly = false, we retrieve the list of Collections from Intercom that have this parent
  if (collectionParentId) {
    if (isReadPermissionsOnly) {
      const collectionsInDb = await IntercomCollection.findAll({
        where: {
          connectorId: connectorId,
          parentId,
          permission: "read",
        },
      });
      const collectionNodes: ContentNode[] = collectionsInDb.map(
        (collection) => ({
          provider: connector.type,
          internalId: getHelpCenterCollectionInternalId(
            connectorId,
            collection.collectionId
          ),
          parentInternalId: collection.parentId
            ? getHelpCenterCollectionInternalId(
                connectorId,
                collection.parentId
              )
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
      const articleNodes: ContentNode[] = articlesInDb.map((article) => ({
        provider: connector.type,
        internalId: getHelpCenterArticleInternalId(
          connectorId,
          article.articleId
        ),
        parentInternalId: article.parentId
          ? getHelpCenterArticleInternalId(connectorId, article.parentId)
          : null,
        type: "file",
        title: article.title,
        sourceUrl: article.url,
        expandable: false,
        permission: article.permission,
        dustDocumentId: null,
        lastUpdatedAt: article.updatedAt.getTime(),
      }));

      collectionNodes.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
      articleNodes.sort((a, b) => {
        return a.title.localeCompare(b.title);
      });
      nodes = [...collectionNodes, ...articleNodes];
    } else {
      logger.error(
        { connectorId, parentInternalId },
        "Trying to retrieve children of a collection while permissions are limited to level 1 collections only."
      );
    }
    nodes.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });
    return nodes;
  }

  return nodes;
}
