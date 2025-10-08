import type { ConnectorProvider, Result } from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";

import { launchJoinChannelWorkflow } from "@connectors/connectors/slack/temporal/client";
import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { SlackAutoReadPattern } from "@connectors/types";

export function findMatchingChannelPatterns(
  remoteChannelName: string,
  autoReadChannelPatterns: SlackAutoReadPattern[]
): SlackAutoReadPattern[] {
  return autoReadChannelPatterns.filter((pattern) => {
    const regex = new RegExp(`^${pattern.pattern}$`);
    return regex.test(remoteChannelName);
  });
}

export async function autoReadChannel(
  teamId: string,
  logger: Logger,
  slackChannelId: string,
  provider: Extract<ConnectorProvider, "slack_bot" | "slack"> = "slack"
): Promise<Result<boolean, Error>> {
  const slackConfigurations =
    await SlackConfigurationResource.listForTeamId(teamId);
  const connectorIds = slackConfigurations.map((c) => c.connectorId);
  const connectors = await ConnectorResource.fetchByIds(provider, connectorIds);
  const connector = connectors.find((c) => c.type === provider);

  if (!connector) {
    return new Err(
      new Error(
        `Connector not found for teamId ${teamId} and provider ${provider}`
      )
    );
  }

  const slackConfiguration = slackConfigurations.find(
    (c) => c.connectorId === connector.id
  );

  if (!slackConfiguration) {
    return new Err(
      new Error(`Slack configuration not found for teamId ${teamId}`)
    );
  }

  // Check if the workspace is in maintenance mode before launching the workflow
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const dustAPI = new DustAPI(
    {
      url: apiConfig.getDustFrontAPIUrl(),
    },
    {
      apiKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
    },
    logger
  );

  // Make a simple API call to check if workspace is accessible
  // If workspace is in maintenance, the API will return 503
  const spacesRes = await dustAPI.getSpaces();
  if (spacesRes.isErr()) {
    logger.info(
      {
        connectorId: connector.id,
        teamId,
        error: spacesRes.error.message,
      },
      "Skipping auto-read channel: workspace API call failed (likely in maintenance)"
    );
    return new Err(
      new Error(
        `Cannot auto-read channel: workspace is unavailable (${spacesRes.error.message})`
      )
    );
  }

  const { connectorId, autoReadChannelPatterns } = slackConfiguration;

  // If no patterns are configured, nothing to do
  if (!autoReadChannelPatterns || autoReadChannelPatterns.length === 0) {
    return new Ok(false);
  }

  // Launch workflow which will check if channel matches patterns and process accordingly
  const workflowResult = await launchJoinChannelWorkflow(
    connectorId,
    slackChannelId,
    "auto-read"
  );

  if (workflowResult.isErr()) {
    // Check if this is the "operation in progress" error
    if (workflowResult.error instanceof WorkflowExecutionAlreadyStartedError) {
      // For auto-read, if the operation is already in progress, that's fine
      logger.info(
        {
          connectorId,
          slackChannelId,
          teamId,
        },
        "Auto-read channel join already in progress"
      );
      return new Ok(true);
    }

    return new Err(workflowResult.error);
  }

  return new Ok(true);
}
