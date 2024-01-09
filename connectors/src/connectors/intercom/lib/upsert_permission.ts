import { Client as IntercomClient } from "intercom-client";
import { Op } from "sequelize";

import {
  fetchIntercomArticles,
  fetchIntercomCollection,
  fetchIntercomCollections,
  fetchIntercomHelpCenter,
  getIntercomArticle,
} from "@connectors/connectors/intercom/lib/intercom_api";
import { Connector } from "@connectors/lib/models";
import {
  IntercomArticle,
  IntercomCollection,
  IntercomHelpCenter,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";

/**
 * Returns the Intercom HelpCenter from database
 * Or retrieves it from Intercom API and creates it in database.
 */
export async function upsertHelpCenterPermission({
  connector,
  intercomClient,
  helpCenterId,
  permission,
  withChildren = false,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  helpCenterId: string;
  permission: "read" | "none";
  withChildren?: boolean;
}): Promise<IntercomHelpCenter | null> {
  let helpCenter = await IntercomHelpCenter.findOne({
    where: {
      connectorId: connector.id,
      helpCenterId,
    },
  });
  if (helpCenter) {
    await helpCenter.update({
      permission,
    });
  } else if (permission === "read") {
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
        permission,
      });
    }
  }

  if (!helpCenter) {
    return null;
  }

  // If we revoke the permission:
  // We set all children (collections & articles) to "none".
  if (permission === "none") {
    const level1Collections = await IntercomCollection.findAll({
      where: {
        helpCenterId: helpCenter.helpCenterId,
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
        const level2Collections = await IntercomCollection.findAll({
          where: {
            parentId: c1.collectionId,
          },
        });
        await Promise.all(
          level2Collections.map((c2) =>
            Promise.all([
              IntercomCollection.update(
                { permission: "none" },
                {
                  where: {
                    parentId: c2.collectionId,
                  },
                }
              ),
              c2.update({ permission: "none" }),
            ])
          )
        );
        await c1.update({ permission: "none" });
      })
    );
  }

  // If we add the permission & we want to progpagate it to all children:
  // We set all children (collections & articles) to "read" and create them if they don't exist.
  if (permission === "read" && withChildren) {
    const level1Collections = await fetchIntercomCollections(
      intercomClient,
      helpCenter.helpCenterId,
      null
    );
    const permissionUpdatePromises = level1Collections.map((c1) =>
      upsertCollectionPermission({
        connector,
        intercomClient,
        collectionId: c1.id,
        permission,
      })
    );
    await Promise.all(permissionUpdatePromises);
  }

  return helpCenter;
}

/**
 * Returns the Intercom Collection from database
 * Or retrieves it from Intercom API and creates it in database.
 */
export async function upsertCollectionPermission({
  connector,
  intercomClient,
  collectionId,
  permission,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  collectionId: string;
  permission: "read" | "none";
}): Promise<IntercomCollection | null> {
  let collection = await IntercomCollection.findOne({
    where: {
      connectorId: connector.id,
      collectionId,
    },
  });
  if (collection) {
    await collection.update({
      permission,
    });
  } else {
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
        permission,
      });
    }
  }

  if (!collection) {
    logger.error(
      { collectionId },
      "[Intercom] Collection not found in Intercom API."
    );
    return null;
  }

  // If we revoke the permission:
  // We set all children (collections & articles) to "none".
  if (permission === "none") {
    const childrenCollections = await IntercomCollection.findAll({
      where: {
        parentId: collection.collectionId,
      },
    });
    const updatePromises = childrenCollections.map((c) =>
      Promise.all([
        IntercomCollection.update(
          { permission: "none" },
          {
            where: {
              parentId: c.collectionId,
            },
          }
        ),
        c.update({ permission: "none" }),
      ])
    );
    await Promise.all(updatePromises);
    await IntercomArticle.update(
      { permission: "none" },
      {
        where: {
          parents: {
            [Op.contains]: [collection.collectionId],
          },
        },
      }
    );
  }

  // If we add the permission:
  // We create the Help Center if it doesn't exist.
  // We  set all children (collections & articles) to "read" and create them if they don't exist.
  if (permission === "read") {
    await upsertHelpCenterPermission({
      connector,
      intercomClient,
      helpCenterId: collection.helpCenterId,
      permission,
      withChildren: false,
    });

    const childrenArticles = await fetchIntercomArticles(
      intercomClient,
      collection.collectionId
    );
    const articlePermissionPromises = childrenArticles.map((a) =>
      upsertArticlePermission({
        connector,
        intercomClient,
        articleId: a.id,
        permission,
      })
    );
    await Promise.all(articlePermissionPromises);

    const childrenCollections = await fetchIntercomCollections(
      intercomClient,
      collection.helpCenterId,
      collection.collectionId
    );
    const collectionPermissionPromises = childrenCollections.map((c) =>
      upsertCollectionPermission({
        connector,
        intercomClient,
        collectionId: c.id,
        permission,
      })
    );
    await Promise.all(collectionPermissionPromises);
  }

  return collection;
}

/**
 * Returns the Intercom Article from database
 * Or retrieves it from Intercom API and creates it in database.
 */
export async function upsertArticlePermission({
  connector,
  intercomClient,
  articleId,
  permission,
}: {
  connector: Connector;
  intercomClient: IntercomClient;
  articleId: string;
  permission: "read" | "none";
}): Promise<IntercomArticle | null> {
  const article = await IntercomArticle.findOne({
    where: {
      connectorId: connector.id,
      articleId,
    },
  });
  if (article) {
    await article.update({
      permission,
    });
    return article;
  }

  const intercomArticle = await getIntercomArticle(intercomClient, articleId);
  if (!intercomArticle) {
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
    permission,
  });
}
