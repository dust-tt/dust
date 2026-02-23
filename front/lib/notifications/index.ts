import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type {
  NotificationPreferencesDelay,
  WorkflowTriggerId,
} from "@app/types/notification_preferences";
import {
  DEFAULT_NOTIFICATION_DELAY,
  isNotificationPreferencesDelay,
  makeNotificationPreferencesUserMetadata,
} from "@app/types/notification_preferences";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { Novu } from "@novu/api";
import { NovuError } from "@novu/api/models/errors";
import type { ChannelPreference } from "@novu/react";
import { WebClient } from "@slack/web-api";
import { createHmac } from "crypto";
import { Op } from "sequelize";
import config from "../api/config";
import { Authenticator, getFeatureFlags } from "../auth";
import { DustError } from "../error";
import { DataSourceResource } from "../resources/data_source_resource";
import { UserMetadataModel } from "../resources/storage/models/user";

export type NotificationAllowedTags = Array<"conversations" | "admin">;

export const getNovuClient = async (): Promise<Novu> => {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new Error("NOVU_SECRET_KEY is not set");
  }

  if (!process.env.NEXT_PUBLIC_NOVU_API_URL) {
    throw new Error("NEXT_PUBLIC_NOVU_API_URL is not set");
  }

  const config = {
    secretKey: process.env.NOVU_SECRET_KEY,
    serverURL: process.env.NEXT_PUBLIC_NOVU_API_URL,
  };

  return new Novu(config);
};

export const getSubscriberHash = async (
  user: UserTypeWithWorkspaces
): Promise<string | null> => {
  return computeSubscriberHash(user.sId);
};

export const computeSubscriberHash = (subscriberId: string): string => {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new Error("NOVU_SECRET_KEY is not set");
  }

  const novuSecretKey = process.env.NOVU_SECRET_KEY;

  const hmacHash = createHmac("sha256", novuSecretKey)
    .update(subscriberId)
    .digest("hex");

  return hmacHash;
};

export const getUserNotificationDelay = async ({
  subscriberId,
  workspaceId,
  channel,
  workflowTriggerId,
}: {
  subscriberId?: string;
  workspaceId: string;
  channel: keyof ChannelPreference;
  workflowTriggerId?: WorkflowTriggerId;
}): Promise<NotificationPreferencesDelay> => {
  if (!subscriberId) {
    return DEFAULT_NOTIFICATION_DELAY;
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    workspaceId
  );
  const user = auth.user();
  if (!user) {
    return DEFAULT_NOTIFICATION_DELAY;
  }
  const metadata = await UserMetadataModel.findOne({
    where: {
      userId: user.id,
      key: {
        [Op.eq]: makeNotificationPreferencesUserMetadata(
          channel,
          workflowTriggerId
        ),
      },
    },
  });
  const metadataValue = metadata?.value;
  return isNotificationPreferencesDelay(metadataValue)
    ? metadataValue
    : DEFAULT_NOTIFICATION_DELAY;
};

export const getSlackConnectionIdentifier = (userSId: string): string => {
  return `slack_connection_${userSId}`;
};

const isSlackNotificationsFeatureEnabled = async (
  subscriberId: string,
  workspaceId: string
): Promise<boolean> => {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    workspaceId
  );
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());

  return featureFlags.includes("conversations_slack_notifications");
};

const isNovuSlackChannelConfigured = async (
  subscriberId: string
): Promise<boolean> => {
  const novu = await getNovuClient();
  const connectionIdentifier = getSlackConnectionIdentifier(subscriberId);

  const slackChannelConnections = await novu.channelConnections.list({
    subscriberId,
    integrationIdentifier: "slack",
    channel: "chat",
  });

  const slackChannelConnection = slackChannelConnections.result.data.find(
    (connection) => connection.identifier === connectionIdentifier
  );

  if (!slackChannelConnection) {
    return false;
  }

  const slackChannelEndpoints = await novu.channelEndpoints.list({
    subscriberId,
    integrationIdentifier: "slack",
    connectionIdentifier,
    channel: "chat",
  });

  if (slackChannelEndpoints.result.data.length === 0) {
    return false;
  }

  return true;
};

const getSlackToken = async (
  auth: Authenticator
): Promise<
  Result<string, DustError<"connection_not_found" | "internal_error">>
> => {
  const slackBotConnections = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack_bot"
  );

  if (slackBotConnections.length === 0) {
    return new Err(
      new DustError(
        "connection_not_found",
        "Slack Bot is not configured for this workspace."
      )
    );
  }

  const slackConnection = slackBotConnections[0];

  if (!slackConnection.connectorId) {
    return new Err(
      new DustError(
        "connection_not_found",
        "Slack Bot is not configured for this workspace."
      )
    );
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const connectorRes = await connectorsAPI.getConnector(
    slackConnection.connectorId
  );

  if (connectorRes.isErr()) {
    return new Err(
      new DustError("connection_not_found", connectorRes.error.message)
    );
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const tokenResult = await oauthApi.getAccessToken({
    connectionId: connectorRes.value.connectionId,
  });

  if (tokenResult.isErr()) {
    return new Err(new DustError("internal_error", tokenResult.error.message));
  }

  return new Ok(tokenResult.value.access_token);
};

const configureNovuSlackChannelForUser = async (
  subscriberId: string | undefined,
  workspaceId: string
): Promise<{
  success: boolean;
}> => {
  if (!subscriberId) {
    return { success: false };
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    workspaceId
  );
  const accessToken = await getSlackToken(auth);

  if (accessToken.isErr()) {
    return {
      success: false,
    };
  }

  const slackClient = new WebClient(accessToken.value);

  const slackUser = await slackClient.users.lookupByEmail({
    email: auth.getNonNullableUser().email,
  });

  if (!slackUser.user?.id) {
    return {
      success: false,
    };
  }

  const slackWorkspace = await slackClient.team.info();

  if (!slackWorkspace.team?.id) {
    return {
      success: false,
    };
  }

  const novu = await getNovuClient();
  const connectionIdentifier = getSlackConnectionIdentifier(subscriberId);

  await novu.channelConnections.create({
    subscriberId,
    identifier: connectionIdentifier,
    integrationIdentifier: "slack",
    auth: {
      accessToken: accessToken.value,
    },
    workspace: {
      id: slackWorkspace.team.id,
      name: slackWorkspace.team?.name,
    },
  });

  await novu.channelEndpoints.create({
    subscriberId,
    type: "slack_user",
    integrationIdentifier: "slack",
    connectionIdentifier,
    endpoint: {
      userId: slackUser.user.id,
    },
  });

  return {
    success: true,
  };
};

export const ensureSlackNotificationsReady = async (
  subscriberId?: string,
  workspaceId?: string
): Promise<{
  isReady: boolean;
}> => {
  if (!subscriberId || !workspaceId) {
    return { isReady: false };
  }

  const isFeatureEnabled = await isSlackNotificationsFeatureEnabled(
    subscriberId,
    workspaceId
  );

  if (!isFeatureEnabled) {
    return { isReady: false };
  }

  const isChannelConfigured = await isNovuSlackChannelConfigured(subscriberId);

  // If the slack channel is not configured, we attempt to configure it automatically.
  // This will fail if the Dust Slack Bot is not configured for the workspace.
  if (!isChannelConfigured) {
    const { success } = await configureNovuSlackChannelForUser(
      subscriberId,
      workspaceId
    );
    if (!success) {
      return { isReady: false };
    }
  }
  return { isReady: true };
};

export const deleteNovuSlackChannelSetup = async (subscriberId: string) => {
  const novu = await getNovuClient();
  const connectionIdentifier = getSlackConnectionIdentifier(subscriberId);

  const slackChannelEndpoints = await novu.channelEndpoints.list({
    subscriberId,
    integrationIdentifier: "slack",
    connectionIdentifier,
    channel: "chat",
  });

  // Note that there should be only one endpoint associated to the connection
  await Promise.all(
    slackChannelEndpoints.result.data.map((endpoint) =>
      novu.channelEndpoints.delete(endpoint.identifier)
    )
  );

  try {
    await novu.channelConnections.delete(connectionIdentifier);
  } catch (error) {
    if (error instanceof NovuError && error.statusCode === 404) {
      // Connection doesn't exist — nothing to delete.
      return;
    }
    logger.error(
      { error: normalizeError(error), connectionIdentifier },
      "Failed to delete Slack channel connection"
    );
    throw normalizeError(error);
  }
};
