import {
  makePageInternalId,
  makeSpaceInternalId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import { ConfluencePage } from "@connectors/lib/models/confluence";
import type { ModelId } from "@connectors/types";

interface RawConfluencePage {
  pageId: string;
  parentId: string | null;
  spaceId: string;
}

export async function getSpaceHierarchy(
  connectorId: ModelId,
  spaceId: string
): Promise<Record<string, string | null>> {
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

  return Object.fromEntries(pageIdToParentIdMap);
}

export async function getConfluencePageParentIds(
  connectorId: ModelId,
  page: RawConfluencePage,
  cachedHierarchy?: Record<string, string | null>
): Promise<[string, string, ...string[]]> {
  const pageIdToParentIdMap =
    cachedHierarchy ?? (await getSpaceHierarchy(connectorId, page.spaceId));

  const parentIds = [];
  let currentId = page.pageId;

  // If the page has not been saved yet. Let's add it to the object.
  if (!(currentId in pageIdToParentIdMap)) {
    pageIdToParentIdMap[currentId] = page.parentId;
  }

  // Traverse the hierarchy upwards until no further parent IDs are found.
  while (currentId in pageIdToParentIdMap) {
    const parentId = pageIdToParentIdMap[currentId];
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
    makePageInternalId(page.pageId),
    ...parentIds.map((p) => makePageInternalId(p)),
    // Add the space id at the end.
    makeSpaceInternalId(page.spaceId),
  ] as unknown as [string, string, ...string[]]; // casting here since what we are interested in in knowing that parents[1] will be a string, no matter if it is the last element or one from the middle
}
