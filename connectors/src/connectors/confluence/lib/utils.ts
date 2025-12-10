import { ConfluenceClient } from "@connectors/connectors/confluence/lib/confluence_client";
import { ConfluenceConfigurationModel } from "@connectors/lib/models/confluence";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export function extractConfluenceIdsFromUrl(
  url: string
): { spaceKey: string; pageId: string } | null {
  const regex = /\/wiki\/spaces\/([^/]+)\/pages\/(\d+)/;
  const match = url.match(regex);
  if (!match || match.length < 3) {
    return null;
  }

  return {
    spaceKey: match[1]!,
    pageId: match[2]!,
  };
}

async function fetchConfluenceConnector(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Connector not found.");
  }

  return connector;
}

async function getConfluenceAccessTokenWithThrow(connectionId: string) {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "confluence",
    connectionId,
  });

  return token.access_token;
}

export async function getConfluenceClient(config: {
  cloudId?: string;
  connectorId: ModelId;
}): Promise<ConfluenceClient>;
export async function getConfluenceClient(
  config: { cloudId?: string },
  connector: ConnectorResource
): Promise<ConfluenceClient>;
export async function getConfluenceClient(
  config: {
    cloudId?: string;
    connectorId?: ModelId;
  },
  connector?: ConnectorResource
) {
  const { cloudId, connectorId } = config;

  // Ensure the connector is fetched if not directly provided.
  const effectiveConnector =
    connector ??
    (connectorId ? await fetchConfluenceConnector(connectorId) : undefined);

  if (!effectiveConnector) {
    throw new Error("A valid connector or connectorId must be provided.");
  }

  const accessToken = await getConfluenceAccessTokenWithThrow(
    effectiveConnector.connectionId
  );

  return new ConfluenceClient(accessToken, {
    cloudId,
    useProxy: effectiveConnector.useProxy ?? false,
  });
}

export async function getConfluenceConfig({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const confluenceConfig = await ConfluenceConfigurationModel.findOne({
    where: {
      connectorId,
    },
  });
  if (!confluenceConfig) {
    throw new Error(
      `Confluence configuration not found (connectorId: ${connectorId})`
    );
  }

  return confluenceConfig;
}
