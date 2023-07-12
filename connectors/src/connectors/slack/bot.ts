import { literal } from "sequelize";

import { ChatSessionUpdateEvent, DustAPI } from "@connectors/lib/dust_api";
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
  getSlackClient,
  getUserName,
  whoAmI,
} from "./temporal/activities";

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
    const accessToken = await getAccessToken(connector.connectionId);
    const slackClient = getSlackClient(accessToken);
    await slackClient.chat.postMessage({
      channel: slackChannel,
      text: `An error occured. Our team has been notified and will work on it as soon as possible.`,
      thread_ts: slackMessageTs,
    });
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
  const slackUser = slackUserInfo.user;
  if (slackUser.profile?.email) {
    slackChatBotMessage.slackEmail = slackUser.profile.email;
  }
  if (slackUser.profile?.display_name) {
    slackChatBotMessage.slackUserName = slackUser.profile.display_name;
  }
  await slackChatBotMessage.save();
  const c = new DustAPI({
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
    const mySlackUser = await whoAmI(accessToken);
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
  const chatRes = await c.newChatStreamed(
    message,
    slackUser.tz ? slackUser.tz : "Europe/Paris"
  );
  if (chatRes.isErr()) {
    return new Err(new Error(chatRes.error.message));
  }
  const chat = chatRes.value;
  let fullAnswer = "";
  let lastSentDate = new Date();
  for await (const event of chat.eventStream) {
    if (event.type === "chat_message_create") {
      if (event.message.role === "error") {
        return new Err(new Error(event.message.message));
      }
    } else if (event.type === "chat_message_tokens") {
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
    } else if (event.type === "chat_session_update") {
      const finalAnswer = `${fullAnswer}\n\n <${DUST_API}/w/${connector.workspaceId}/u/chat/${event.session.sId}|Continue the conversation on Dust.tt>`;
      await slackClient.chat.update({
        channel: slackChannel,
        text: finalAnswer,
        ts: mainMessage.ts as string,
        thread_ts: slackMessageTs,
      });

      await slackChatBotMessage.update({
        chatSessionSid: event.session.sId,
        completedAt: literal("now()"),
      });
      return new Ok(event);
    }
  }

  return new Err(new Error("Failed to get the final answer from Dust"));
}

export async function enableSlackBot(
  connectorId: ModelId
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
  slackConfig.botEnabled = true;
  await slackConfig.save();

  return new Ok(void 0);
}
