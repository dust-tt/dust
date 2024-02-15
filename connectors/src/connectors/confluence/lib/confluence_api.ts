import type { ModelId } from "@dust-tt/types";

import { confluenceConfig } from "@connectors/connectors/confluence/lib/config";
import { ConfluenceClient } from "@connectors/connectors/confluence/lib/confluence_client";
import { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import { getConnectionFromNango } from "@connectors/lib/nango_helpers";
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
  const confluenceConnection = await getConnectionFromNango({
    connectionId,
    integrationId: getRequiredNangoConfluenceConnectorId(),
    useCache: false,
  });

  const { access_token: confluenceAccessToken } =
    confluenceConnection.credentials;

  const client = new ConfluenceClient(confluenceAccessToken, {
    cloudId: config?.cloudId,
  });

  return client.getGlobalSpaces();
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
  pageCursor?: string
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
