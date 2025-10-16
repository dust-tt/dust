import type { TurnContext } from "botbuilder";

import { sendTextMessage } from "@connectors/api/webhooks/teams/bot_messaging_utils";
import { getMicrosoftClient } from "@connectors/connectors/microsoft/index";
import { isActiveMemberOfWorkspace } from "@connectors/lib/bot/user_validation";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export interface TeamsUserInfo {
  email: string;
  displayName: string;
  userAadObjectId: string;
}

export async function validateTeamsUser(
  context: TurnContext,
  connector: ConnectorResource
): Promise<TeamsUserInfo | null> {
  const {
    from: { aadObjectId: userAadObjectId },
  } = context.activity;

  if (!userAadObjectId) {
    logger.error("No user AAD object ID found in Teams context");
    await sendTextMessage(
      context,
      "❌ Unable to identify user for this Teams message"
    );
    return null;
  }

  // Get Microsoft Graph client
  const client = await getMicrosoftClient(connector.connectionId);

  // Get user info from Microsoft Graph
  let userInfo;
  try {
    userInfo = await client.api(`/users/${userAadObjectId}`).get();
  } catch (error) {
    logger.error(
      { error, userAadObjectId, connectorId: connector.id },
      "Failed to get user info from Microsoft Graph"
    );
    await sendTextMessage(context, "❌ Unable to retrieve user information");
    return null;
  }

  const displayName = userInfo?.displayName || "Unknown User";
  const email = userInfo?.mail;

  if (!email) {
    logger.warn(
      { userAadObjectId, displayName, connectorId: connector.id },
      "No email found for Teams user"
    );
    await sendTextMessage(
      context,
      "❌ Unable to retrieve your email address. Please ensure your Microsoft profile has an email configured."
    );
    return null;
  }

  // Validate that the user is an active member of the workspace
  const isActiveMember = await isActiveMemberOfWorkspace(connector, email);

  if (!isActiveMember) {
    logger.info(
      {
        connectorId: connector.id,
        userEmail: email,
        userAadObjectId,
      },
      "Unauthorized Teams user attempted to access bot"
    );

    await sendTextMessage(
      context,
      "❌ You are not a member of this Dust workspace. Please contact your workspace administrator to get access."
    );
    return null;
  }

  logger.info(
    {
      connectorId: connector.id,
      userEmail: email,
      displayName,
      userAadObjectId,
    },
    "Teams user validated successfully"
  );

  return {
    email,
    displayName,
    userAadObjectId,
  };
}
