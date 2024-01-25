import type {
  ConnectorPermission,
  ConnectorResource,
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
import type { Connector } from "@connectors/lib/models";
import type { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import {
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";

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

function createConnectorResourceFromSpace(
  space: ConfluenceSpace | ConfluenceSpaceType,
  baseUrl: string,
  permission: ConnectorPermission,
  { isExpandable }: { isExpandable: boolean }
): ConnectorResource {
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

function createConnectorResourceFromPage(
  parent: { id: string; type: "page" | "space" },
  baseUrl: string,
  page: ConfluencePage,
  isExpandable = false
): ConnectorResource {
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

async function checkPageHasChildren(connectorId: ModelId, pageId: string) {
  const childrenPagesCount = await ConfluencePage.count({
    where: {
      connectorId,
      parentId: pageId,
    },
  });

  return childrenPagesCount > 0;
}

async function getSynchronizedSpaces(
  connectorId: ModelId,
  confluenceConfig: ConfluenceConfiguration,
  parentInternalId: string
): Promise<Result<ConnectorResource[], Error>> {
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

  const allPages: ConnectorResource[] = [];
  for (const page of pagesWithinSpace) {
    const hasChildren = await checkPageHasChildren(connectorId, page.pageId);

    const res = createConnectorResourceFromPage(
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
): Promise<Result<ConnectorResource[], Error>> {
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

  const allPages: ConnectorResource[] = [];
  for (const page of pagesWithinSpace) {
    const hasChildren = await checkPageHasChildren(connectorId, page.pageId);

    const res = createConnectorResourceFromPage(
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
  connector: Connector,
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
    createConnectorResourceFromSpace(space, confluenceConfig.url, "read", {
      isExpandable: true,
    })
  );

  return new Ok(allSpaces);
}

export async function retrieveAvailableSpaces(
  connector: Connector,
  confluenceConfig: ConfluenceConfiguration
) {
  const { id: connectorId } = connector;

  const syncedSpaces = await ConfluenceSpace.findAll({
    where: {
      connectorId: connectorId,
    },
  });

  const spaces = await listConfluenceSpaces(connector, confluenceConfig);

  return spaces.map((space) => {
    const isSynced = syncedSpaces.some((ss) => ss.spaceId === space.id);

    return createConnectorResourceFromSpace(
      space,
      confluenceConfig.url,
      isSynced ? "read" : "none",
      { isExpandable: false }
    );
  });
}
