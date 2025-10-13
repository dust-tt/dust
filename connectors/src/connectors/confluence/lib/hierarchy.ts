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
  parentType: "page" | "folder" | null | undefined;
};

export type ConfluenceContentWithType = Pick<
  RawConfluenceEntity,
  "parentId" | "parentType"
>;

export async function getSpaceHierarchy(
  connectorId: ModelId,
  spaceId: string
): Promise<Record<string, ConfluenceContentWithType>> {
  // Currently opting for a best-effort strategy to reduce database queries,
  // this logic may be enhanced later for important Confluence connections.
  // By fetching all content within a space, we reconstruct parent-child
  // relationships in-app, minimizing database interactions.
  // If needed we could move the same approach as Notion and cache the results in Redis.
  const allPages = await ConfluencePage.findAll({
    attributes: ["pageId", "parentId", "parentType"],
    where: {
      connectorId,
      spaceId,
    },
  });

  const allFolders = await ConfluenceFolder.findAll({
    attributes: ["folderId", "parentId", "parentType"],
    where: {
      connectorId,
      spaceId,
    },
  });

  // Map each contentId to its respective parentId.
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
  } as Record<string, ConfluenceContentWithType>;
}

export async function getConfluenceContentParentIds(
  connectorId: ModelId,
  content: RawConfluenceEntity,
  cachedHierarchy?: Record<string, ConfluenceContentWithType>
): Promise<[string, string, ...string[]]> {
  const contentIdToParentContentMap =
    cachedHierarchy ?? (await getSpaceHierarchy(connectorId, content.spaceId));

  const parentEntities: { id: string; type: "page" | "folder" }[] = [];
  let currentId = content.id;

  // If the content has not been saved yet. Let's add it to the object.
  if (!(currentId in contentIdToParentContentMap)) {
    contentIdToParentContentMap[currentId] = content;
  }

  // Traverse the hierarchy upwards until no further parent IDs are found.
  while (currentId in contentIdToParentContentMap) {
    const parentContent = contentIdToParentContentMap[currentId];
    if (parentContent?.parentId && parentContent?.parentType) {
      parentEntities.push({
        id: parentContent.parentId,
        type: parentContent.parentType,
      });
      // Move up the hierarchy.
      currentId = parentContent.parentId;
    } else {
      // No more parents, exit the loop.
      break;
    }
  }

  // Casting here since what we are interested in in knowing that parents[1] will be a string,
  // no matter if it is the last element or one from the middle.
  return [
    makeEntityInternalId(content.type, content.id), // Add the current content.
    ...parentEntities.map((p) => makeEntityInternalId(p.type, p.id)),
    makeSpaceInternalId(content.spaceId), // Add the space id at the end.
  ] as unknown as [string, string, ...string[]];
}
