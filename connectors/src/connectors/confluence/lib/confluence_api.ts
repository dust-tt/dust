import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type {
  ConfluenceSearchContentType,
  ConfluenceSpaceType,
} from "@connectors/connectors/confluence/lib/confluence_client";
import {
  CONFLUENCE_SUPPORTED_SPACE_TYPES,
  ConfluenceClient,
} from "@connectors/connectors/confluence/lib/confluence_client";
import { apiConfig } from "@connectors/lib/api/config";
import { ConfluenceConfigurationModel } from "@connectors/lib/models/confluence";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { getOAuthConnectionAccessToken } from "@connectors/types";

const PAGE_FETCH_LIMIT = 100;

export async function getConfluenceCloudInformation(accessToken: string) {
  const client = new ConfluenceClient(accessToken);

  try {
    return await client.getCloudInformation();
  } catch (err) {
    logger.error({ err }, "Error getting Confluence cloud information");
    return null;
  }
}

export async function getConfluenceAccessToken(
  connectionId: string
): Promise<Result<string, Error>> {
  const tokRes = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider: "confluence",
    connectionId,
  });
  if (tokRes.isErr()) {
    logger.error(
      { connectionId, error: tokRes.error },
      "Error retrieving Confluence access token"
    );

    return new Err(new Error(tokRes.error.message));
  }

  return new Ok(tokRes.value.access_token);
}

export async function getConfluenceUserAccountId(accessToken: string) {
  const client = new ConfluenceClient(accessToken);

  const userAccount = await client.getUserAccount();

  return userAccount.account_id;
}

async function fetchConfluenceConfiguration(connectorId: ModelId) {
  const confluenceConfig = await ConfluenceConfigurationModel.findOne({
    where: {
      connectorId: connectorId,
    },
  });

  return confluenceConfig;
}

export async function listConfluenceSpaces(
  connector: ConnectorResource,
  confluenceConfig?: ConfluenceConfigurationModel
): Promise<Result<ConfluenceSpaceType[], Error>> {
  const { id: connectorId, connectionId } = connector;

  const config =
    confluenceConfig ?? (await fetchConfluenceConfiguration(connectorId));
  const confluenceAccessTokenRes = await getConfluenceAccessToken(connectionId);
  if (confluenceAccessTokenRes.isErr()) {
    return confluenceAccessTokenRes;
  }

  const client = new ConfluenceClient(confluenceAccessTokenRes.value, {
    cloudId: config?.cloudId,
    useProxy: connector.useProxy ?? false,
  });

  const allSpaces = new Map<string, ConfluenceSpaceType>();

  for (const spaceType of CONFLUENCE_SUPPORTED_SPACE_TYPES) {
    let nextPageCursor: string | null = "";
    do {
      const { spaces, nextPageCursor: nextCursor } = await client.getSpaces(
        spaceType,
        { pageCursor: nextPageCursor }
      );

      spaces.forEach((s) => allSpaces.set(s.id, s));

      nextPageCursor = nextCursor;
    } while (nextPageCursor);
  }

  return new Ok([...allSpaces.values()]);
}

export async function pageHasReadRestrictions(
  client: ConfluenceClient,
  pageId: string
) {
  const pageReadRestrictions = await client.getPageReadRestrictions(pageId);

  if (pageReadRestrictions === null) {
    return null; // Page not found, we let the caller choose how to handle this.
  }

  const hasGroupReadPermissions =
    pageReadRestrictions.restrictions.group.results.length > 0;
  const hasUserReadPermissions =
    pageReadRestrictions.restrictions.user.results.length > 0;

  return hasGroupReadPermissions || hasUserReadPermissions;
}

interface BaseConfluenceContentRef {
  hasChildren: boolean;
  hasReadRestrictions: boolean;
  id: string;
  parentId: string | null;
  version: number;
}

export type ConfluencePageRef = BaseConfluenceContentRef & {
  type: "page";
};

export type ConfluenceFolderRef = BaseConfluenceContentRef & {
  type: "folder";
};

export type ConfluenceContentRef = ConfluencePageRef | ConfluenceFolderRef;

function getConfluenceContentRef(
  page: ConfluenceSearchContentType
): ConfluenceContentRef {
  const hasReadRestrictions =
    page.restrictions.read.restrictions.group.results.length > 0 ||
    page.restrictions.read.restrictions.user.results.length > 0;

  const hasFolderChildren =
    typeof page.childTypes.folder === "object"
      ? page.childTypes.folder.value
      : page.childTypes.folder;
  const hasPageChildren =
    typeof page.childTypes.page === "object"
      ? page.childTypes.page.value
      : page.childTypes.page;

  const hasChildren = hasFolderChildren || hasPageChildren;

  return {
    hasChildren,
    hasReadRestrictions,
    id: page.id,
    // Ancestors is an array of the page's ancestors, starting with the root page.
    parentId: page.ancestors[page.ancestors.length - 1]?.id ?? null,
    type: page.type,
    version: page.version.number,
  };
}

export async function getActiveChildContentRefs(
  client: ConfluenceClient,
  {
    pageCursor,
    parentContentId,
    spaceKey,
  }: {
    pageCursor: string | null;
    parentContentId: string;
    spaceKey: string;
  }
) {
  // Fetch the child content of the parent page.
  const { content: childContent, nextPageCursor } =
    await client.getChildContent({
      limit: PAGE_FETCH_LIMIT,
      pageCursor,
      parentContentId,
      spaceKey,
    });

  const activeChildContentIds = childContent
    .filter((p) => p.status === "current")
    .map((p) => p.id);

  if (activeChildContentIds.length === 0) {
    return { childContentRefs: [], nextPageCursor };
  }

  const childContentRefs: ConfluenceContentRef[] = childContent.map(
    getConfluenceContentRef
  );

  return { childContentRefs, nextPageCursor };
}

export async function bulkFetchConfluencePageRefs(
  client: ConfluenceClient,
  {
    limit,
    pageIds,
    spaceKey,
  }: {
    limit: number;
    pageIds: string[];
    spaceKey: string;
  }
) {
  // Fetch page metadata (version, parent, permissions, etc.) for the given page IDs
  const pagesWithDetails = await client.getPagesByIdsInSpace({
    spaceKey,
    pageIds,
    limit,
  });

  const pageRefs: ConfluenceContentRef[] = pagesWithDetails.results.map(
    getConfluenceContentRef
  );

  return pageRefs;
}
