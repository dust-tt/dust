import type { ModelId } from "@dust-tt/types";
import { getOAuthConnectionAccessToken } from "@dust-tt/types";

import { confluenceConfig } from "@connectors/connectors/confluence/lib/config";
import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import { ConfluenceClient } from "@connectors/connectors/confluence/lib/confluence_client";
import { apiConfig } from "@connectors/lib/api/config";
import { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import { getConnectionFromNango } from "@connectors/lib/nango_helpers";
import { isDualUseOAuthConnectionId } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

const { getRequiredNangoConfluenceConnectorId } = confluenceConfig;

export async function getConfluenceCloudInformation(accessToken: string) {
  const client = new ConfluenceClient(accessToken);

  try {
    return await client.getCloudInformation();
  } catch (err) {
    return null;
  }
}

export async function getConfluenceAccessToken(connectionId: string) {
  if (isDualUseOAuthConnectionId(connectionId)) {
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
      throw new Error("Error retrieving Confluence access token");
    }

    return tokRes.value.access_token;
  } else {
    const connection = await getConnectionFromNango({
      connectionId: connectionId,
      integrationId: getRequiredNangoConfluenceConnectorId(),
      refreshToken: false,
      useCache: true,
    });

    return connection.credentials.access_token;
  }
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
) {
  const { id: connectorId, connectionId } = connector;

  const config =
    confluenceConfig ?? (await fetchConfluenceConfiguration(connectorId));
  const confluenceAccessToken = await getConfluenceAccessToken(connectionId);

  const client = new ConfluenceClient(confluenceAccessToken, {
    cloudId: config?.cloudId,
  });

  const allSpaces = new Map<string, ConfluenceSpaceType>();
  let nextPageCursor: string | null = "";
  do {
    const { spaces, nextPageCursor: nextCursor } =
      await client.getGlobalSpaces(nextPageCursor);

    spaces.forEach((s) => allSpaces.set(s.id, s));

    nextPageCursor = nextCursor;
  } while (nextPageCursor);

  return [...allSpaces.values()];
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

export async function getActiveChildPageIds(
  client: ConfluenceClient,
  parentPageId: string,
  pageCursor: string | null
) {
  const { pages: childPages, nextPageCursor } = await client.getChildPages(
    parentPageId,
    pageCursor
  );

  const childPageIds = childPages
    .filter((p) => p.status === "current")
    .map((p) => p.id);

  return { childPageIds, nextPageCursor };
}
