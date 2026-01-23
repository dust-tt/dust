import { apiConfig } from "@connectors/lib/api/config";
import { NotionConnectorStateModel } from "@connectors/lib/models/notion";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { getConnectionCredentials } from "@connectors/types/oauth/client/credentials";

const logger = mainLogger.child({ provider: "notion" });

export async function getNotionAccessToken(
  connectorId: ModelId
): Promise<string> {
  // Fetch connector and notion connector state concurrently
  const [connector, notionConnectorState] = await Promise.all([
    ConnectorResource.fetchById(connectorId),
    NotionConnectorStateModel.findOne({
      where: { connectorId },
    }),
  ]);

  if (!connector) {
    throw new Error(`Connector not found: ${connectorId}`);
  }

  if (!notionConnectorState) {
    throw new Error(
      `NotionConnectorState not found for connector: ${connectorId}`
    );
  }

  // Use OAuth token if no private integration credential ID (regular case).
  if (!notionConnectorState.privateIntegrationCredentialId) {
    const token = await getOAuthConnectionAccessTokenWithThrow({
      logger,
      provider: "notion",
      connectionId: connector.connectionId,
    });
    return token.access_token;
  }

  // Use private integration credential ID if it exists.
  const credentialsRes = await getConnectionCredentials({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    credentialsId: notionConnectorState.privateIntegrationCredentialId,
  });

  if (credentialsRes.isErr()) {
    throw new Error(
      `Failed to retrieve private integration credentials: ${credentialsRes.error.message}`
    );
  }

  const credentials = credentialsRes.value.credential;
  if (credentials.provider !== "notion") {
    throw new Error(
      `Invalid credential provider: expected 'notion', got '${credentials.provider}'`
    );
  }

  const notionCredentials = credentials.content as {
    integration_token: string;
  };
  if (!notionCredentials.integration_token) {
    throw new Error("Invalid Notion credentials: missing integration_token");
  }

  return notionCredentials.integration_token;
}
