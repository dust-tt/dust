import type { Client as IntercomClient } from "intercom-client";
import { Op } from "sequelize";

import {
  fetchIntercomArticle,
  fetchIntercomArticles,
  fetchIntercomCollection,
  fetchIntercomCollections,
  fetchIntercomHelpCenter,
} from "@connectors/connectors/intercom/lib/intercom_api";
import type { Connector } from "@connectors/lib/models";
import {
  IntercomArticle,
  IntercomCollection,
  IntercomHelpCenter,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";

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
  connector,
  intercomClient,
  helpCenterId,
  withChildren = false,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  helpCenterId: string;
  withChildren?: boolean;
}): Promise<IntercomHelpCenter | null> {
  let helpCenter = await IntercomHelpCenter.findOne({
    where: {
      connectorId: connector.id,
      helpCenterId,
    },
  });

  if (helpCenter?.permission === "none") {
    await helpCenter.update({
      permission: "read",
    });
  }
  if (!helpCenter) {
    const helpCenterOnIntercom = await fetchIntercomHelpCenter(
      connector.connectionId,
      helpCenterId
    );
    if (helpCenterOnIntercom) {
      helpCenter = await IntercomHelpCenter.create({
        connectorId: connector.id,
        helpCenterId: helpCenterOnIntercom.id,
        name: helpCenterOnIntercom.display_name,
        identifier: helpCenterOnIntercom.identifier,
        intercomWorkspaceId: helpCenterOnIntercom.workspace_id,
        permission: "read",
      });
    }
  }

  if (!helpCenter) {
    logger.error({ helpCenterId }, "[Intercom] Help Center not found.");
    throw new Error("Help Center not found.");
  }

  // If withChilren we are allowing the full Help Center.
  if (withChildren) {
    const level1Collections = await fetchIntercomCollections(
      intercomClient,
      helpCenter.helpCenterId,
      null
    );
    const permissionUpdatePromises = level1Collections.map((c1) =>
      allowSyncCollection({
        connector,
        intercomClient,
        collectionId: c1.id,
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
  connector,
  helpCenterId,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  helpCenterId: string;
}): Promise<IntercomHelpCenter | null> {
  const helpCenter = await IntercomHelpCenter.findOne({
    where: {
      connectorId: connector.id,
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
  connector,
  intercomClient,
  collectionId,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  collectionId: string;
}): Promise<IntercomCollection | null> {
  let collection = await IntercomCollection.findOne({
    where: {
      connectorId: connector.id,
      collectionId,
    },
  });

  if (collection?.permission === "none") {
    await collection.update({
      permission: "read",
    });
  } else if (!collection) {
    const intercomCollection = await fetchIntercomCollection(
      intercomClient,
      collectionId
    );
    if (intercomCollection) {
      collection = await IntercomCollection.create({
        connectorId: connector.id,
        collectionId: intercomCollection.id,
        intercomWorkspaceId: intercomCollection.workspace_id,
        helpCenterId: intercomCollection.help_center_id,
        parentId: intercomCollection.parent_id,
        name: intercomCollection.name,
        description: intercomCollection.description,
        url: intercomCollection.url,
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

  // We create the Help Center if it doesn't exist.
  await allowSyncHelpCenter({
    connector,
    intercomClient,
    helpCenterId: collection.helpCenterId,
    withChildren: false,
  });

  // We  set all children (collections & articles) to "read" and create them if they don't exist.
  const childrenArticles = await fetchIntercomArticles(
    intercomClient,
    collection.collectionId
  );
  const articlePermissionPromises = childrenArticles.map((a) =>
    allowSyncArticle({
      connector,
      intercomClient,
      articleId: a.id,
    })
  );
  await Promise.all(articlePermissionPromises);

  const childrenCollections = await fetchIntercomCollections(
    intercomClient,
    collection.helpCenterId,
    collection.collectionId
  );
  const collectionPermissionPromises = childrenCollections.map((c) =>
    allowSyncCollection({
      connector,
      intercomClient,
      collectionId: c.id,
    })
  );
  await Promise.all(collectionPermissionPromises);

  return collection;
}

/**
 * Mark a collection as permission "none" and all children (collections & articles)
 */
export async function revokeSyncCollection({
  connector,
  collectionId,
}: {
  connector: Connector;
  collectionId: string;
}): Promise<IntercomCollection | null> {
  // Revoke permission for this level 1 collection
  const collection = await IntercomCollection.findOne({
    where: {
      connectorId: connector.id,
      collectionId,
    },
  });
  if (collection?.permission === "read") {
    await collection.update({
      permission: "none",
    });
  }

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

  return collection;
}

/**
 * Mark an article as permission "read"
 */
export async function allowSyncArticle({
  connector,
  intercomClient,
  articleId,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  articleId: string;
}): Promise<IntercomArticle | null> {
  const article = await IntercomArticle.findOne({
    where: {
      connectorId: connector.id,
      articleId,
    },
  });

  if (article?.permission === "read") {
    return article;
  }
  if (article) {
    await article.update({
      permission: "read",
    });
    return article;
  }

  const intercomArticle = await fetchIntercomArticle(intercomClient, articleId);
  if (!intercomArticle) {
    logger.error(
      { articleId },
      "[Intercom] Article not found in Intercom API."
    );
    return null;
  }
  return IntercomArticle.create({
    connectorId: connector.id,
    articleId: intercomArticle.id,
    title: intercomArticle.title,
    url: intercomArticle.url,
    intercomWorkspaceId: intercomArticle.workspace_id,
    authorId: intercomArticle.author_id,
    parentId: intercomArticle.parent_id,
    parentType:
      intercomArticle.parent_type === "collection" ? "collection" : null,
    parents: intercomArticle.parent_ids,
    state: intercomArticle.state === "published" ? "published" : "draft",
    permission: "read",
  });
}
