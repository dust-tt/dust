import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import { launchJoinChannelWorkflow } from "@connectors/connectors/slack/temporal/client";
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
    if (
      typeof workflowResult.error === "object" &&
      workflowResult.error !== null &&
      "type" in workflowResult.error &&
      workflowResult.error.type === "connector_operation_in_progress"
    ) {
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

    // For other errors, return them as is
    const error =
      workflowResult.error instanceof Error
        ? workflowResult.error
        : new Error(
            typeof workflowResult.error === "object" &&
            "message" in workflowResult.error
              ? (workflowResult.error.message as string)
              : "Unknown error"
          );
    return new Err(error);
  }

  return new Ok(true);
}
