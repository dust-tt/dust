import type { ModelId, Result } from "@dust-tt/types";
import { Err, getOAuthConnectionAccessToken, Ok } from "@dust-tt/types";

import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import {
  CONFLUENCE_SUPPORTED_SPACE_TYPES,
  ConfluenceClient,
} from "@connectors/connectors/confluence/lib/confluence_client";
import { apiConfig } from "@connectors/lib/api/config";
import { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export async function getConfluenceCloudInformation(accessToken: string) {
  const client = new ConfluenceClient(accessToken);

  try {
    return await client.getCloudInformation();
  } catch (err) {
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
  const confluenceConfig = await ConfluenceConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });

  return confluenceConfig;
}

export async function listConfluenceSpaces(
  connector: ConnectorResource,
  confluenceConfig?: ConfluenceConfiguration
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

  const hasGroupReadPermissions =
    pageReadRestrictions.restrictions.group.results.length > 0;
  const hasUserReadPermissions =
    pageReadRestrictions.restrictions.user.results.length > 0;

  return hasGroupReadPermissions || hasUserReadPermissions;
}

export interface ConfluencePageRef {
  id: string;
  version: number;
  parentId?: string;
}

const PAGE_FETCH_LIMIT = 100;

export async function getActiveChildPageRefs(
  client: ConfluenceClient,
  {
    pageCursor,
    parentPageId,
    spaceId,
  }: {
    pageCursor: string | null;
    parentPageId: string;
    spaceId: string;
  }
) {
  const { pages: childPages, nextPageCursor } = await client.getChildPages({
    parentPageId,
    pageCursor,
    limit: PAGE_FETCH_LIMIT,
  });

  const activeChildPageIds = childPages
    .filter((p) => p.status === "current" && p.spaceId === spaceId)
    .map((p) => p.id);

  if (activeChildPageIds.length === 0) {
    return { childPageRefs: [], nextPageCursor };
  }

  console.log(
    ">> activeChildPageIds:",
    JSON.stringify(activeChildPageIds, null, 2)
  );

  const pagesWithDetails = await client.getPagesByIdsInSpace({
    spaceId,
    sort: "id",
    pageIds: activeChildPageIds,
    limit: PAGE_FETCH_LIMIT,
  });

  const childPageRefs: ConfluencePageRef[] = pagesWithDetails.pages.map(
    (p) => ({
      id: p.id,
      version: p.version.number,
      parentId: p.parentId ?? undefined,
    })
  );

  console.log(">> childPageRefs", JSON.stringify(childPageRefs, null, 2));

  return { childPageRefs, nextPageCursor };
}
