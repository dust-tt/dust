import {
  makeEntityInternalId,
  makeSpaceInternalId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import {
  ConfluenceFolder,
  ConfluencePage,
} from "@connectors/lib/models/confluence";
import type { ModelId } from "@connectors/types";

type RawConfluenceEntity = {
  id: string;
  spaceId: string;
  type: "page" | "folder";
  parentId: string | null;
  parentType: "page" | "folder" | null;
};

type ConfluenceEntityWithType = Pick<
  RawConfluenceEntity,
  "parentId" | "parentType"
>;

export async function getSpaceHierarchy(
  connectorId: ModelId,
  spaceId: string
): Promise<Record<string, ConfluenceEntityWithType>> {
  // Currently opting for a best-effort strategy to reduce database queries,
  // this logic may be enhanced later for important Confluence connections.
  // By fetching all entities within a space, we reconstruct parent-child
  // relationships in-app, minimizing database interactions.
  // If needed we could move the same approach as Notion and cache the results in Redis.
  const allPages = await ConfluencePage.findAll({
    attributes: ["pageId", "parentId"],
    where: {
      connectorId,
      spaceId,
    },
  });

  const allFolders = await ConfluenceFolder.findAll({
    attributes: ["folderId", "parentId"],
    where: {
      connectorId,
      spaceId,
    },
  });

  // Map each entityId to its respective parentId.
  const pageIdToParentIdMap = new Map(
    allPages.map((page) => [
      page.pageId,
      { type: "page", parentType: page.parentType, parentId: page.parentId },
    ])
  );
  const folderIdToParentIdMap = new Map(
    allFolders.map((folder) => [
      folder.folderId,
      {
        type: "folder",
        parentType: folder.parentType,
        parentId: folder.parentId,
      },
    ])
  );

  return {
    ...Object.fromEntries(pageIdToParentIdMap),
    ...Object.fromEntries(folderIdToParentIdMap),
  } as Record<string, ConfluenceEntityWithType>;
}

export async function getConfluenceEntityParentIds(
  connectorId: ModelId,
  entity: RawConfluenceEntity,
  cachedHierarchy?: Record<string, ConfluenceEntityWithType>
): Promise<[string, string, ...string[]]> {
  const entityIdToParentEntityMap =
    cachedHierarchy ?? (await getSpaceHierarchy(connectorId, entity.spaceId));

  const parentEntities: { id: string; type: "page" | "folder" }[] = [];
  let currentId = entity.id;

  // If the entity has not been saved yet. Let's add it to the object.
  if (!(currentId in entityIdToParentEntityMap)) {
    entityIdToParentEntityMap[currentId] = entity;
  }

  // Traverse the hierarchy upwards until no further parent IDs are found.
  while (currentId in entityIdToParentEntityMap) {
    const parentEntity = entityIdToParentEntityMap[currentId];
    if (parentEntity?.parentId && parentEntity?.parentType) {
      parentEntities.push({
        id: parentEntity.parentId,
        type: parentEntity.parentType,
      });
      // Move up the hierarchy.
      currentId = parentEntity.parentId;
    } else {
      // No more parents, exit the loop.
      break;
    }
  }

  return [
    // Add the current entity.
    makeEntityInternalId(entity.type, entity.id),
    ...parentEntities.map((p) => makeEntityInternalId(p.type, p.id)),
    // Add the space id at the end.
    makeSpaceInternalId(entity.spaceId),
  ] as unknown as [string, string, ...string[]]; // casting here since what we are interested in in knowing that parents[1] will be a string, no matter if it is the last element or one from the middle
}
