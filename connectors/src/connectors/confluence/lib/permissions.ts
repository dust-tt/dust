import type {
  ConnectorPermission,
  ContentNode,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Op } from "sequelize";

import { listConfluenceSpaces } from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import {
  getIdFromConfluenceInternalId,
  isConfluenceInternalPageId,
  isConfluenceInternalSpaceId,
  makeConfluenceInternalPageId,
  makeConfluenceInternalSpaceId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import type { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import {
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

function isConfluenceSpaceModel(
  confluenceSpace: unknown
): confluenceSpace is ConfluenceSpace {
  return (
    typeof confluenceSpace === "object" &&
    confluenceSpace !== null &&
    "spaceId" in confluenceSpace &&
    typeof confluenceSpace.spaceId === "string"
  );
}

export function createContentNodeFromSpace(
  space: ConfluenceSpace | ConfluenceSpaceType,
  baseUrl: string,
  permission: ConnectorPermission,
  { isExpandable }: { isExpandable: boolean }
): ContentNode {
  const urlSuffix = isConfluenceSpaceModel(space)
    ? space.urlSuffix
    : space._links.webui;
  const spaceId = isConfluenceSpaceModel(space) ? space.spaceId : space.id;

  return {
    provider: "confluence",
    internalId: makeConfluenceInternalSpaceId(spaceId),
    parentInternalId: null,
    type: "folder",
    title: space.name || "Unnamed Space",
    sourceUrl: `${baseUrl}/wiki${urlSuffix}`,
    expandable: isExpandable,
    permission,
    dustDocumentId: null,
    lastUpdatedAt: null,
  };
}

export function createContentNodeFromPage(
  parent: { id: string; type: "page" | "space" },
  baseUrl: string,
  page: ConfluencePage,
  isExpandable = false
): ContentNode {
  return {
    provider: "confluence",
    internalId: makeConfluenceInternalPageId(page.pageId),
    parentInternalId:
      parent.type === "space"
        ? makeConfluenceInternalSpaceId(parent.id)
        : makeConfluenceInternalPageId(parent.id),
    type: "file",
    title: page.title,
    sourceUrl: `${baseUrl}/wiki${page.externalUrl}`,
    expandable: isExpandable,
    permission: "read",
    dustDocumentId: null,
    lastUpdatedAt: null,
  };
}

export async function checkPageHasChildren(
  connectorId: ModelId,
  pageId: string
) {
  const childrenPage = await ConfluencePage.findOne({
    attributes: ["id"],
    where: {
      connectorId,
      parentId: pageId,
    },
  });

  return childrenPage != null;
}

async function getSynchronizedSpaces(
  connectorId: ModelId,
  confluenceConfig: ConfluenceConfiguration,
  parentInternalId: string
): Promise<Result<ContentNode[], Error>> {
  const confluenceId = getIdFromConfluenceInternalId(parentInternalId);

  const parentSpace = await ConfluenceSpace.findOne({
    attributes: ["id", "spaceId"],
    where: {
      connectorId,
      spaceId: confluenceId,
    },
  });

  if (!parentSpace) {
    return new Err(new Error(`Confluence space not found.`));
  }

  const pagesWithinSpace = await ConfluencePage.findAll({
    attributes: ["id", "pageId", "title", "externalUrl"],
    where: {
      connectorId,
      spaceId: parentSpace.spaceId,
      parentId: {
        [Op.is]: null,
      },
    },
  });

  const allPages: ContentNode[] = [];
  for (const page of pagesWithinSpace) {
    const hasChildren = await checkPageHasChildren(connectorId, page.pageId);

    const res = createContentNodeFromPage(
      { id: parentSpace.spaceId, type: "space" },
      confluenceConfig.url,
      page,
      hasChildren
    );

    allPages.push(res);
  }

  return new Ok(allPages);
}

async function getSynchronizedChildrenPages(
  connectorId: ModelId,
  confluenceConfig: ConfluenceConfiguration,
  parentInternalId: string
): Promise<Result<ContentNode[], Error>> {
  const confluenceId = getIdFromConfluenceInternalId(parentInternalId);

  const parentPage = await ConfluencePage.findOne({
    attributes: ["id", "pageId"],
    where: {
      connectorId,
      pageId: confluenceId,
    },
  });

  if (!parentPage) {
    return new Err(new Error(`Confluence page not found.`));
  }

  const pagesWithinSpace = await ConfluencePage.findAll({
    attributes: ["id", "pageId", "title", "externalUrl"],
    where: {
      connectorId,
      parentId: parentPage.pageId,
    },
  });

  const allPages: ContentNode[] = [];
  for (const page of pagesWithinSpace) {
    const hasChildren = await checkPageHasChildren(connectorId, page.pageId);

    const res = createContentNodeFromPage(
      { id: parentPage.pageId, type: "page" },
      confluenceConfig.url,
      page,
      hasChildren
    );

    allPages.push(res);
  }

  return new Ok(allPages);
}

export async function retrieveHierarchyForParent(
  connector: ConnectorResource,
  confluenceConfig: ConfluenceConfiguration,
  parentInternalId: string | null
) {
  const { id: connectorId } = connector;

  if (parentInternalId) {
    if (isConfluenceInternalSpaceId(parentInternalId)) {
      const resources = await getSynchronizedSpaces(
        connectorId,
        confluenceConfig,
        parentInternalId
      );

      if (resources.isErr()) {
        return new Err(resources.error);
      }

      return new Ok(resources.value);
    } else if (isConfluenceInternalPageId(parentInternalId)) {
      const resources = await getSynchronizedChildrenPages(
        connectorId,
        confluenceConfig,
        parentInternalId
      );

      if (resources.isErr()) {
        return new Err(resources.error);
      }

      return new Ok(resources.value);
    } else {
      return new Err(new Error("Invalid resource id."));
    }
  }

  const syncedSpaces = await ConfluenceSpace.findAll({
    where: {
      connectorId,
    },
  });

  const allSpaces = syncedSpaces.map((space) =>
    createContentNodeFromSpace(space, confluenceConfig.url, "read", {
      isExpandable: true,
    })
  );

  return new Ok(allSpaces);
}

export async function retrieveAvailableSpaces(
  connector: ConnectorResource,
  confluenceConfig: ConfluenceConfiguration
): Promise<Result<ContentNode[], Error>> {
  const { id: connectorId } = connector;

  const syncedSpaces = await ConfluenceSpace.findAll({
    where: {
      connectorId: connectorId,
    },
  });

  const spacesRes = await listConfluenceSpaces(connector, confluenceConfig);
  if (spacesRes.isErr()) {
    return spacesRes;
  }

  return new Ok(
    spacesRes.value.map((space) => {
      const isSynced = syncedSpaces.some((ss) => ss.spaceId === space.id);

      return createContentNodeFromSpace(
        space,
        confluenceConfig.url,
        isSynced ? "read" : "none",
        { isExpandable: false }
      );
    })
  );
}
