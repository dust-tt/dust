import { literal } from "sequelize";

import { ChatSessionUpdateEvent, DustAPI } from "@connectors/lib/dust_api";
import {
  Connector,
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
  const slackConfigurations = await SlackConfiguration.findAll({
    where: {
      slackTeamId: slackTeamId,
    },
  });

  if (slackConfigurations.length === 0) {
    return new Err(
      new Error(
        `Failed to find slack configuration for Slack team id: ${slackTeamId}`
      )
    );
  }
  const slackConfig = slackConfigurations[0];
  if (!slackConfig) {
    return new Err(
      new Error(
        `Failed to find slack configuration for Slack team id: ${slackTeamId}`
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
      text: `Failed getting your answer. We have been notified of this error and we'll get it fixed as soon as possible.`,
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
    if (event.type === "chat_message_tokens") {
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
