import {
  ChatSessionUpdateEvent,
  DustAPI,
  PostMessagesRequestBodySchema,
} from "@connectors/lib/dust_api";
import {
  Connector,
  ModelId,
  SlackChatBotMessage,
  SlackConfiguration,
} from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";

import {
  getAccessToken,
  getBotUserIdMemoized,
  getSlackClient,
  getUserName,
} from "./temporal/activities";

class SlackExternalUserError extends Error {}

export async function botAnswerMessageWithErrorHandling(
  message: string,
  slackTeamId: string,
  slackChannel: string,
  slackUserId: string,
  slackMessageTs: string
): Promise<Result<ChatSessionUpdateEvent, Error>> {
  const slackConfig = await SlackConfiguration.findOne({
    where: {
      slackTeamId: slackTeamId,
      botEnabled: true,
    },
  });
  if (!slackConfig) {
    return new Err(
      new Error(
        `Failed to find a Slack configuration for which the bot is enabled. Slack team id: ${slackTeamId}.`
      )
    );
  }
  const connector = await Connector.findByPk(slackConfig.connectorId);
  if (!connector) {
    return new Err(new Error("Failed to find connector"));
  }
  const res = await botAnswerMessage(
    message,
    slackTeamId,
    slackChannel,
    slackUserId,
    slackMessageTs,
    connector
  );
  if (res.isErr()) {
    logger.error(
      {
        error: res.error,
        slackTeamId: slackTeamId,
        slackChannel: slackChannel,
        slackUserId: slackUserId,
        slackMessageTs: slackMessageTs,
      },
      "Failed answering to Slack Chat Bot message"
    );
    let errorMessage: string | undefined = undefined;
    if (res.error instanceof SlackExternalUserError) {
      errorMessage = res.error.message;
    } else {
      errorMessage = `An error occured. Our team has been notified and will work on it as soon as possible.`;
    }
    const accessToken = await getAccessToken(connector.connectionId);
    const slackClient = getSlackClient(accessToken);
    await slackClient.chat.postMessage({
      channel: slackChannel,
      text: errorMessage,
      thread_ts: slackMessageTs,
    });
  } else {
    logger.info(
      {
        slackTeamId: slackTeamId,
        slackChannel: slackChannel,
        slackUserId: slackUserId,
        slackMessageTs: slackMessageTs,
        message: message,
      },
      `Successfully answered to Slack Chat Bot message`
    );
  }

  return res;
}

async function botAnswerMessage(
  message: string,
  slackTeamId: string,
  slackChannel: string,
  slackUserId: string,
  slackMessageTs: string,
  connector: Connector
): Promise<Result<ChatSessionUpdateEvent, Error>> {
  const { DUST_API = "https://dust.tt" } = process.env;

  const slackChatBotMessage = await SlackChatBotMessage.create({
    connectorId: connector.id,
    message: message,
    slackUserId: slackUserId,
    slackEmail: "",
    slackUserName: "",
    slackFullName: "",
    slackTimezone: null,
    slackAvatar: null,
    channelId: slackChannel,
    messageTs: slackMessageTs,
  });

  const accessToken = await getAccessToken(connector.connectionId);
  const slackClient = getSlackClient(accessToken);
  const slackUserInfo = await slackClient.users.info({
    user: slackUserId,
  });

  if (!slackUserInfo.ok || !slackUserInfo.user) {
    throw new Error(`Failed to get user info: ${slackUserInfo.error}`);
  }
  if (slackUserInfo.user.profile?.team !== slackTeamId) {
    return new Err(
      new SlackExternalUserError(
        "Hi there. Sorry, but I can only answer to members of the workspace where I am installed."
      )
    );
  }
  const slackUser = slackUserInfo.user;
  if (slackUser.profile?.email) {
    slackChatBotMessage.slackEmail = slackUser.profile.email;
  }
  if (slackUser.profile?.display_name) {
    slackChatBotMessage.slackUserName = slackUser.profile.display_name;
  }
  if (slackUser.profile?.real_name) {
    slackChatBotMessage.slackFullName = slackUser.profile.real_name;
  }
  if (slackUser.profile?.image_512) {
    slackChatBotMessage.slackAvatar = slackUser.profile.image_512;
  }
  if (slackUser.tz) {
    slackChatBotMessage.slackTimezone = slackUser.tz;
  }

  await slackChatBotMessage.save();
  const dustAPI = new DustAPI({
    workspaceId: connector.workspaceId,
    apiKey: connector.workspaceAPIKey,
  });
  const mainMessage = await slackClient.chat.postMessage({
    channel: slackChannel,
    text: "_I am thinking..._",
    thread_ts: slackMessageTs,
    mrkdwn: true,
  });

  // Slack sends the message with user ids when someone is mentionned (bot or user).
  // Here we remove the bot id from the message and we replace user ids by their display names.
  // Example: <@U01J9JZQZ8Z> What is the command to upgrade a workspace in production (cc <@U91J1JEQZ1A>) ?
  // becomes: What is the command to upgrade a workspace in production (cc @julien) ?
  const matches = message.match(/<@[A-Z-0-9]+>/g);
  if (matches) {
    const mySlackUser = await getBotUserIdMemoized(accessToken);
    for (const m of matches) {
      const userId = m.replace(/<|@|>/g, "");
      if (userId === mySlackUser) {
        message = message.replace(m, "");
      } else {
        const userName = await getUserName(
          userId,
          connector.id.toString(),
          slackClient
        );
        message = message.replace(m, `@${userName}`);
      }
    }
  }

  const messagePayload: PostMessagesRequestBodySchema = {
    content: message,
    mentions: [{ configurationId: "dust" }],
    context: {
      timezone: slackChatBotMessage.slackTimezone || "Europe/Paris",
      username: slackChatBotMessage.slackUserName,
      fullName:
        slackChatBotMessage.slackFullName || slackChatBotMessage.slackUserName,
      email: slackChatBotMessage.slackEmail,
      profilePictureUrl: slackChatBotMessage.slackAvatar || null,
    },
  };
  const convRes = await dustAPI.createConversation(
    null,
    "unlisted",
    messagePayload
  );
  if (convRes.isErr()) {
    return new Err(new Error(convRes.error.message));
  }

  const conv = convRes.value;
  const stream = await conv.stream;
  if (stream.isErr()) {
    return new Err(new Error(stream.error.message));
  }

  let fullAnswer = "";
  let lastSentDate = new Date();
  for await (const event of stream.value.eventStream) {
    switch (event.type) {
      case "user_message_error": {
        return new Err(
          new Error(
            `User message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }

      case "agent_error": {
        return new Err(
          new Error(
            `Agent message error: code: ${event.error.code} message: ${event.error.message}`
          )
        );
      }
      case "generation_tokens": {
        fullAnswer += event.text;
        if (lastSentDate.getTime() + 1000 > new Date().getTime()) {
          continue;
        }
        lastSentDate = new Date();
        await slackClient.chat.update({
          channel: slackChannel,
          text: fullAnswer,
          ts: mainMessage.ts as string,
          thread_ts: slackMessageTs,
        });
        break;
      }
      case "agent_generation_success": {
        const finalAnswer = `${event.text}\n\n <${DUST_API}/w/${connector.workspaceId}/assistant/${conv.conversation.sId}|Continue this conversation on Dust>`;

        await slackClient.chat.update({
          channel: slackChannel,
          text: finalAnswer,
          ts: mainMessage.ts as string,
          thread_ts: slackMessageTs,
        });
        break;
      }
      default:
      // Nothing to do on unsupported events
    }
  }
  return new Err(new Error("Failed to get the final answer from Dust"));
}

export async function getBotEnabled(
  connectorId: ModelId
): Promise<Result<boolean, Error>> {
  const slackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (!slackConfig) {
    return new Err(
      new Error(
        `Failed to find a Slack configuration for connector ${connectorId}`
      )
    );
  }

  return new Ok(slackConfig.botEnabled);
}

export async function toggleSlackbot(
  connectorId: ModelId,
  botEnabled: boolean
): Promise<Result<void, Error>> {
  const slackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId: connectorId,
    },
  });
  if (!slackConfig) {
    return new Err(
      new Error(
        `Failed to find a Slack configuration for connector ${connectorId}`
      )
    );
  }
  slackConfig.botEnabled = botEnabled;
  await slackConfig.save();

  return new Ok(void 0);
}
