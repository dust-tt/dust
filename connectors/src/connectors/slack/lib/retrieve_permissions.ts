import type { RetrievePermissionsErrorCode } from "@connectors/connectors/interface";
import { ConnectorManagerError } from "@connectors/connectors/interface";
import { slackChannelInternalIdFromSlackChannelId } from "@connectors/connectors/slack/lib/utils";
import {
  ExternalOAuthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { ConnectorPermission, ContentNode } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { WebAPIPlatformError } from "@slack/web-api";

export async function retrievePermissions({
  connectorId,
  parentInternalId,
  filterPermission,
  getFilteredChannels,
}: {
  connectorId: number;
  parentInternalId: string | null;
  filterPermission: ConnectorPermission | null;
  getFilteredChannels: (
    connectorId: number,
    filterPermission: ConnectorPermission | null
  ) => Promise<
    {
      slackChannelId: string;
      slackChannelName: string;
      permission: ConnectorPermission;
      private: boolean;
    }[]
  >;
}): Promise<
  Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
> {
  if (parentInternalId) {
    return new Err(
      new ConnectorManagerError(
        "INVALID_PARENT_INTERNAL_ID",
        "Slack connector does not support permission retrieval with non null `parentInternalId`"
      )
    );
  }

  const c = await ConnectorResource.fetchById(connectorId);
  if (!c) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(
      new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
    );
  }
  const slackConfig =
    await SlackConfigurationResource.fetchByConnectorId(connectorId);
  if (!slackConfig) {
    logger.error({ connectorId }, "Slack configuration not found");
    // This is unexpected let's throw to return a 500.
    throw new Error("Slack configuration not found");
  }

  try {
    const slackChannels = await getFilteredChannels(c.id, filterPermission);

    const resources: ContentNode[] = slackChannels.map((ch) => ({
      internalId: slackChannelInternalIdFromSlackChannelId(ch.slackChannelId),
      parentInternalId: null,
      type: "folder",
      title: `#${ch.slackChannelName}`,
      sourceUrl: `https://app.slack.com/client/${slackConfig.slackTeamId}/${ch.slackChannelId}`,
      expandable: false,
      permission: ch.permission,
      lastUpdatedAt: null,
      providerVisibility: ch.private ? "private" : "public",
      mimeType: INTERNAL_MIME_TYPES.SLACK.CHANNEL,
    }));

    resources.sort((a, b) => {
      return a.title.localeCompare(b.title);
    });

    return new Ok(resources);
  } catch (e) {
    if (e instanceof ExternalOAuthTokenError) {
      logger.error({ connectorId }, "Slack token invalid");
      return new Err(
        new ConnectorManagerError(
          "EXTERNAL_OAUTH_TOKEN_ERROR",
          "Slack authorization error, please re-authorize."
        )
      );
    }
    if (e instanceof ProviderWorkflowError && e.type === "rate_limit_error") {
      logger.error(
        { connectorId, error: e },
        "Slack rate limit when retrieving permissions."
      );
      return new Err(
        new ConnectorManagerError(
          "RATE_LIMIT_ERROR",
          `Slack rate limit error when retrieving content nodes.`
        )
      );
    }

    const maybeSlackPlatformError = e as WebAPIPlatformError;
    if (
      maybeSlackPlatformError.code === "slack_webapi_platform_error" &&
      maybeSlackPlatformError.data?.error === "account_inactive"
    ) {
      logger.error(
        { connectorId, error: e },
        "Slack account inactive when retrieving permissions."
      );
      return new Err(
        new ConnectorManagerError(
          "EXTERNAL_OAUTH_TOKEN_ERROR",
          `Slack account inactive when retrieving permissions.`
        )
      );
    }
    // Unhandled error, throwing to get a 500.
    throw e;
  }
}
