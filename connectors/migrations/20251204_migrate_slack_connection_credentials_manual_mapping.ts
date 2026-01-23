import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { makeScript } from "scripts/helpers";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import { apiConfig } from "@connectors/lib/api/config";
import { SlackConfigurationModel } from "@connectors/lib/models/slack";
import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ModelId, OAuthAPIError } from "@connectors/types";
import { OAuthAPI } from "@connectors/types";

const PROVIDER = "slack";

// Hard-coded mapping of workspaceId -> userId
const WORKSPACE_USER_MAPPING: Record<string, string> = {
  "01485fcdf9": "d228d41b01",
  "08fb3bd019": "631f19ba4a",
  "092a97f40b": "b1afb7a7d1",
  "0f2c72ce97": "fcb7c06712",
  "13ab6c4f11": "19c260bdd8",
  "14bba9443a": "307d366fd6",
  "1dfa5faa48": "a6ae737b31",
  "24b6f04b91": "61fff6d8c3",
  "26067b6d54": "ba0a16af3b",
  "288972ed31": "4711ad28dd",
  "2f7d1a8574": "a10b6bb7df",
  "48239d6d2d": "03137ba0c6",
  "4926faf5b7": "e03229bec2",
  "4a572490d5": "79aef901a3",
  "59a46aebfc": "bddc73be35",
  "62606eef60": "1037bc555c",
  "669babf9fa": "16f42b0e4b",
  "6c8a52c758": "a07744814a",
  "6da4a6b2f4": "596f9c458c",
  "6ebe107cd8": "ccbb592f5e",
  "72610eea04": "2b80b6689b",
  "784b4332d2": "112abbded0",
  "807ac558b2": "e971852f39",
  "826ca14783": "fc41428ce7",
  "8372d0a32c": "99995ff6bc",
  "83ef9733f8": "f3e9fa7d90",
  "8b58d77285": "93167738dc",
  "8ccf684ee4": "b0db209049",
  "8e305a39f0": "a71c900951",
  "931d8504bc": "2f48d0d1d7",
  "93f4a33ddd": "65662d264b",
  FYnwQlNu8q: "1duP1N9kcT",
  GjczpTvFFZ: "vthehVMDZT",
  a0518ca96d: "6c2c4cdb77",
  b114a67df8: "281021fa9d",
  b3505a1163: "e21ea5871e",
  b69afe5b30: "df6fcdd5a8", // Note: ConnectorId 14 and 49 share this workspaceId but have different users
  ba61f3a977: "f1e8563815",
  bdc73627b8: "e62ba7d53d",
  c39e5f4e39: "8ad34fb253",
  cc36f8aada: "e418b59405",
  d8ee897ef0: "1be00aaf52",
  d97506509e: "902405d7c8",
  dd3kEeQyMv: "em8pBYZ3lD",
  de5b2eb34d: "a822e41eae",
  e043a62350: "4f14e60fdf",
  eb95db7b18: "8b0bdffabb",
  ec0dc471d4: "26647e0227",
  edad6f8557: "04c5d858d8",
  f07f801f46: "0dedb6ea88",
  f1d315177a: "f60e0cd89d",
  f76e54b224: "nyYp3ifRf1",
  f87cffd3a0: "962f230e02",
  fa6be51d57: "1f7ebfffe5",
  q0yljtNlGr: "uWMF6pot2y",
  rrgAkBpmaN: "of6jAg7cbe",
};

async function migrateSlackConnectionCredential(
  api: OAuthAPI,
  connector: ConnectorResource,
  slackClientId: string,
  slackClientSecret: string,
  slackSigningSecret: string,
  logger: Logger,
  execute: boolean
): Promise<Result<void, OAuthAPIError>> {
  logger.info(
    `Migrating connection credential for connector ${connector.id}, connectionId ${connector.connectionId}.`
  );

  if (!execute) {
    logger.info(
      `[DRY RUN] Would create credential and update connection ${connector.connectionId}.`
    );
    return new Ok(undefined);
  }

  // Get SlackConfiguration to retrieve team_id
  const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
    connector.id
  );

  if (!slackConfig) {
    return new Err({
      code: "missing_slack_config",
      message: `No Slack configuration found for connector ${connector.id}`,
    });
  }

  const teamId = slackConfig.slackTeamId;

  // Use the hard-coded mapping instead of fetching from connection metadata
  const userId = WORKSPACE_USER_MAPPING[connector.workspaceId];

  if (!userId) {
    return new Err({
      code: "missing_user_mapping",
      message: `No user_id mapping found for workspaceId ${connector.workspaceId}`,
    });
  }

  logger.info(
    { userId, teamId, workspaceId: connector.workspaceId },
    "Using mapped user_id and team_id for credential creation."
  );

  // Create a credential record for this connection
  const credRes = await api.postCredentials({
    provider: PROVIDER,
    userId,
    workspaceId: connector.workspaceId,
    credentials: {
      client_id: slackClientId,
      client_secret: slackClientSecret,
    },
  });

  if (credRes.isErr()) {
    return credRes;
  }

  const credentialId = credRes.value.credential.credential_id;
  logger.info(
    { credentialId },
    `Created credential for connector ${connector.id}.`
  );

  // Update the connection to reference this credential and set client_id in metadata
  const updateRes = await api.updateConnectionCredential({
    connectionId: connector.connectionId,
    relatedCredentialId: credentialId,
    metadata: { client_id: slackClientId },
  });

  if (updateRes.isErr()) {
    return updateRes;
  }

  logger.info(
    { credentialId },
    `Successfully updated connection ${connector.connectionId} to use credential and set client_id in metadata.`
  );

  // Store credential reference in SlackConfiguration
  await SlackConfigurationModel.update(
    { privateIntegrationCredentialId: credentialId },
    { where: { id: slackConfig.id } }
  );

  logger.info(
    { credentialId },
    `Updated SlackConfiguration for connector ${connector.id} with credential reference.`
  );

  // Configure webhook router
  const webhookService = new WebhookRouterConfigService();
  const currentRegion = connectorsConfig.getCurrentRegion();

  // Get all connectors for this team to build the connector IDs list
  const allTeamSlackConfigs = await SlackConfigurationResource.listForTeamId(
    teamId,
    PROVIDER
  );
  const connectorIds = allTeamSlackConfigs.map((config) => config.connectorId);

  await webhookService.syncEntry(
    PROVIDER,
    teamId,
    slackSigningSecret,
    currentRegion,
    connectorIds
  );

  logger.info(
    { teamId, region: currentRegion, connectorIds },
    `Updated webhook router configuration for team ${teamId} with ${connectorIds.length} connector(s).`
  );

  return new Ok(undefined);
}

async function migrateAllSlackConnections(
  connectorId: ModelId | undefined,
  logger: Logger,
  execute: boolean
) {
  const api = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);

  // Get credentials from environment variables
  const slackClientId = process.env.SLACK_CLIENT_ID;
  const slackClientSecret = process.env.SLACK_CLIENT_SECRET;
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;

  // Validate credentials upfront
  if (!slackClientId || !slackClientSecret || !slackSigningSecret) {
    logger.error(
      "Missing Slack credentials. Please set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET environment variables."
    );
    return;
  }

  // Fetch all Slack connectors
  const allConnectors = connectorId
    ? await ConnectorResource.fetchByIds(PROVIDER, [connectorId])
    : await ConnectorResource.listByType(PROVIDER, {});

  // Filter connectors to only those with null privateIntegrationCredentialId
  const connectors = [];
  for (const connector of allConnectors) {
    const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
      connector.id
    );
    if (slackConfig && slackConfig.privateIntegrationCredentialId === null) {
      connectors.push(connector);
    }
  }

  logger.info(
    `Found ${connectors.length} Slack connectors with null privateIntegrationCredentialId to migrate (out of ${allConnectors.length} total).`
  );

  // Check which connectors have mappings
  const connectorsWithMapping = connectors.filter(
    (c) => WORKSPACE_USER_MAPPING[c.workspaceId]
  );
  const connectorsWithoutMapping = connectors.filter(
    (c) => !WORKSPACE_USER_MAPPING[c.workspaceId]
  );

  logger.info(
    {
      withMapping: connectorsWithMapping.length,
      withoutMapping: connectorsWithoutMapping.length,
    },
    "Connector mapping status."
  );

  if (connectorsWithoutMapping.length > 0) {
    logger.warn(
      {
        workspaceIds: connectorsWithoutMapping.map((c) => c.workspaceId),
      },
      "Some connectors have no mapping in WORKSPACE_USER_MAPPING."
    );
  }

  // Migrate each connector (creates one credential per connection)
  let successCount = 0;
  let errorCount = 0;

  for (const connector of connectorsWithMapping) {
    const localLogger = logger.child({
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
      connectionId: connector.connectionId,
    });

    const migrationRes = await migrateSlackConnectionCredential(
      api,
      connector,
      slackClientId,
      slackClientSecret,
      slackSigningSecret,
      localLogger,
      execute
    );

    if (migrationRes.isErr()) {
      errorCount++;
      localLogger.error(
        {
          error: migrationRes.error,
        },
        "Failed to migrate connector."
      );
    } else {
      successCount++;
    }
  }

  logger.info(
    {
      total: connectorsWithMapping.length,
      success: successCount,
      errors: errorCount,
      skipped: connectorsWithoutMapping.length,
    },
    "Done migrating Slack connectors."
  );
}

makeScript(
  {
    connectorId: {
      alias: "c",
      describe: "Connector ID (optional, for testing single connector)",
      type: "number",
    },
  },
  async ({ connectorId, execute }, logger) => {
    await migrateAllSlackConnections(connectorId, logger, execute);
  }
);
