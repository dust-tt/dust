import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { Op } from "sequelize";

import { listConfluenceSpaces } from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import {
  getConfluenceIdFromInternalId,
  isInternalPageId,
  isInternalSpaceId,
  makePageInternalId,
  makeSpaceInternalId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import type { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import {
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorPermission, ContentNode } from "@connectors/types";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

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
  const spaceId = isConfluenceSpaceModel(space) ? space.spaceId : space.id;
  const urlSuffix = isConfluenceSpaceModel(space)
    ? space.urlSuffix
    : space._links.webui;

  return {
    internalId: makeSpaceInternalId(spaceId),
    parentInternalId: null,
    type: "folder",
    title: space.name || "Unnamed Space",
    sourceUrl: `${baseUrl}/wiki${urlSuffix}`,
    expandable: isExpandable,
    permission,
    lastUpdatedAt: null,
    mimeType: INTERNAL_MIME_TYPES.CONFLUENCE.SPACE,
  };
}

export function createContentNodeFromPage(
  parent: { id: string; type: "page" | "space" },
  baseUrl: string,
  page: ConfluencePage,
  isExpandable = false
): ContentNode {
  return {
    internalId: makePageInternalId(page.pageId),
    parentInternalId:
      parent.type === "space"
        ? makeSpaceInternalId(parent.id)
        : makePageInternalId(parent.id),
    type: "document",
    title: page.title,
    sourceUrl: `${baseUrl}/wiki${page.externalUrl}`,
    expandable: isExpandable,
    permission: "read",
    lastUpdatedAt: null,
    mimeType: INTERNAL_MIME_TYPES.CONFLUENCE.PAGE,
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
  const confluenceId = getConfluenceIdFromInternalId(parentInternalId);

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
  const confluenceId = getConfluenceIdFromInternalId(parentInternalId);

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
    if (isInternalSpaceId(parentInternalId)) {
      const resources = await getSynchronizedSpaces(
        connectorId,
        confluenceConfig,
        parentInternalId
      );

      if (resources.isErr()) {
        return new Err(resources.error);
      }

      return new Ok(resources.value);
    } else if (isInternalPageId(parentInternalId)) {
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
