import type { ModelId } from "@dust-tt/types";

import {
  makeConfluenceInternalPageId,
  makeConfluenceInternalSpaceId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import { ConfluencePage } from "@connectors/lib/models/confluence";

interface RawConfluencePage {
  pageId: string;
  parentId: string | null;
  spaceId: string;
}

export async function getSpaceHierarchy(connectorId: ModelId, spaceId: string) {
  // Currently opting for a best-effort strategy to reduce database queries,
  // this logic may be enhanced later for important Confluence connections.
  // By fetching all pages within a space, we reconstruct parent-child
  // relationships in-app, minimizing database interactions.
  // If needed we could move the same approach as Notion and cache the results in Redis.
  const allPages = await ConfluencePage.findAll({
    attributes: ["pageId", "parentId"],
    where: {
      connectorId,
      spaceId,
    },
  });

  // Map each pageId to its respective parentId.
  const pageIdToParentIdMap = new Map(
    allPages.map((page) => [page.pageId, page.parentId])
  );

  return pageIdToParentIdMap;
}

export async function getConfluencePageParentIds(
  connectorId: ModelId,
  page: RawConfluencePage,
  cachedHierarchy?: Map<string, string | null>
) {
  const pageIdToParentIdMap =
    cachedHierarchy ?? (await getSpaceHierarchy(connectorId, page.spaceId));

  const parentIds = [];
  let currentId = page.pageId;

  // If the page has not been saved yet. Let's add it to the set.
  if (!pageIdToParentIdMap.has(currentId)) {
    pageIdToParentIdMap.set(currentId, page.parentId);
  }

  // Traverse the hierarchy upwards until no further parent IDs are found.
  while (pageIdToParentIdMap.has(currentId)) {
    const parentId = pageIdToParentIdMap.get(currentId);
    if (parentId) {
      parentIds.push(parentId);
      // Move up the hierarchy.
      currentId = parentId;
    } else {
      // No more parents, exit the loop.
      break;
    }
  }

  return [
    // Add the current page.
    makeConfluenceInternalPageId(page.pageId),
    ...parentIds.map((p) => makeConfluenceInternalPageId(p)),
    // Add the space id at the end.
    makeConfluenceInternalSpaceId(page.spaceId),
  ];
}
