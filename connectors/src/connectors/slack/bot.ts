import { ChatSessionUpdateEvent, DustAPI } from "@connectors/lib/dust_api";
import { Connector, SlackConfiguration } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";

import {
  getAccessToken,
  getSlackClient,
  getUserName,
  whoAmI,
} from "./temporal/activities";

export async function botAnswerMessage(
  message: string,
  slackTeamId: string,
  slackChannel: string,
  slackUserId: string,
  slackMessageTs: string
): Promise<Result<ChatSessionUpdateEvent, Error>> {
  const { DUST_API = "https://dust.tt" } = process.env;
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
  const accessToken = await getAccessToken(connector.connectionId);
  const slackClient = getSlackClient(accessToken);
  const slackUserInfo = await slackClient.users.info({
    user: slackUserId,
  });
  if (!slackUserInfo.ok || !slackUserInfo.user) {
    throw new Error(`Failed to get user info: ${slackUserInfo.error}`);
  }
  const slackUser = slackUserInfo.user;

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
    console.log(event);
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

      return new Ok(event);
    }
  }

  return new Err(new Error("Failed to get the final answer from Dust"));
}
