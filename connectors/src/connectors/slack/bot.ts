import levenshtein from "fast-levenshtein";

import {
  AgentActionType,
  AgentGenerationSuccessEvent,
  AgentMessageType,
  DustAPI,
  RetrievalDocumentType,
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

const { DUST_API = "https://dust.tt" } = process.env;

class SlackExternalUserError extends Error {}

export async function botAnswerMessageWithErrorHandling(
  message: string,
  slackTeamId: string,
  slackChannel: string,
  slackUserId: string,
  slackMessageTs: string
): Promise<Result<AgentGenerationSuccessEvent, Error>> {
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
): Promise<Result<AgentGenerationSuccessEvent, Error>> {
  const slackChatBotMessage = await SlackChatBotMessage.create({
    connectorId: connector.id,
    message: message,
    slackUserId: slackUserId,
    slackEmail: "",
    slackUserName: "unknown",
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
  } else if (slackUser.profile?.real_name) {
    // A slack bot has no display name but just a real name so we use it if we could not find the
    // display name.
    slackChatBotMessage.slackUserName = slackUser.profile.real_name;
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
    text: "_Thinking..._",
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
  // Extract all ~mentions.
  const mentionCandidates = message.match(/~[a-zA-Z0-9_-]{1,20}/g) || [];

  let mentions: { assistantName: string; assistantId: string }[] = [];
  if (mentionCandidates.length > 1) {
    return new Err(
      new SlackExternalUserError(
        "Only one assistant at a time can be called through Slack."
      )
    );
  } else if (mentionCandidates.length === 1) {
    const agentConfigurationsRes = await dustAPI.getAgentConfigurations();
    if (agentConfigurationsRes.isErr()) {
      return new Err(new Error(agentConfigurationsRes.error.message));
    }
    const agentConfigurations = agentConfigurationsRes.value;
    for (const mc of mentionCandidates) {
      let bestCandidate:
        | {
            assistantId: string;
            assistantName: string;
            distance: number;
          }
        | undefined = undefined;
      for (const agentConfiguration of agentConfigurations) {
        const distance = levenshtein.get(
          mc.slice(1).toLowerCase(),
          agentConfiguration.name.toLowerCase()
        );
        if (bestCandidate === undefined || bestCandidate.distance > distance) {
          bestCandidate = {
            assistantId: agentConfiguration.sId,
            assistantName: agentConfiguration.name,
            distance: distance,
          };
        }
      }

      if (bestCandidate) {
        mentions.push({
          assistantId: bestCandidate.assistantId,
          assistantName: bestCandidate.assistantName,
        });
        message = message.replace(
          mc,
          `:mention[${bestCandidate.assistantName}]{sId=${bestCandidate.assistantId}}`
        );
      }
    }
  }

  if (mentions.length === 0) {
    mentions.push({ assistantId: "dust", assistantName: "dust" });
  }
  // for now we support only one mention.
  mentions = mentions.slice(0, 1);
  const convRes = await dustAPI.createConversation({
    title: null,
    visibility: "unlisted",
    message: {
      content: message,
      mentions: mentions.map((m) => {
        return { configurationId: m.assistantId };
      }),
      context: {
        timezone: slackChatBotMessage.slackTimezone || "Europe/Paris",
        username: slackChatBotMessage.slackUserName,
        fullName:
          slackChatBotMessage.slackFullName ||
          slackChatBotMessage.slackUserName,
        email: slackChatBotMessage.slackEmail,
        profilePictureUrl: slackChatBotMessage.slackAvatar || null,
      },
    },
  });

  if (convRes.isErr()) {
    return new Err(new Error(convRes.error.message));
  }

  const conversation = convRes.value;

  slackChatBotMessage.conversationId = conversation.sId;
  await slackChatBotMessage.save();

  const agentMessages = conversation.content
    .map((versions) => {
      const m = versions[versions.length - 1];
      return m;
    })
    .filter((m) => {
      return m && m.type === "agent_message";
    });
  if (agentMessages.length === 0) {
    return new Err(new Error("Failed to retrieve agent message"));
  }
  const agentMessage = agentMessages[0] as AgentMessageType;

  const streamRes = await dustAPI.streamAgentMessageEvents({
    conversation,
    message: agentMessage,
  });

  if (streamRes.isErr()) {
    return new Err(new Error(streamRes.error.message));
  }

  const botIdentity = `@${mentions[0]?.assistantName}:\n`;
  let fullAnswer = botIdentity;
  let action: AgentActionType | null = null;
  let lastSentDate = new Date();
  for await (const event of streamRes.value.eventStream) {
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
        if (lastSentDate.getTime() + 1500 > new Date().getTime()) {
          continue;
        }
        lastSentDate = new Date();

        let finalAnswer = _processCiteMention(fullAnswer, action);
        finalAnswer += `...\n\n <${DUST_API}/w/${connector.workspaceId}/assistant/${conversation.sId}|Continue this conversation on Dust>`;

        await slackClient.chat.update({
          channel: slackChannel,
          text: finalAnswer,
          ts: mainMessage.ts as string,
          thread_ts: slackMessageTs,
        });
        break;
      }
      case "agent_action_success": {
        action = event.action;
        break;
      }
      case "agent_generation_success": {
        fullAnswer = `${botIdentity}${event.text}`;

        let finalAnswer = _processCiteMention(fullAnswer, action);
        finalAnswer += `\n\n <${DUST_API}/w/${connector.workspaceId}/assistant/${conversation.sId}|Continue this conversation on Dust>`;

        await slackClient.chat.update({
          channel: slackChannel,
          text: finalAnswer,
          ts: mainMessage.ts as string,
          thread_ts: slackMessageTs,
        });
        return new Ok(event);
        break;
      }
      default:
      // Nothing to do on unsupported events
    }
  }
  return new Err(new Error("Failed to get the final answer from Dust"));
}

function _processCiteMention(
  content: string,
  action: AgentActionType | null
): string {
  const references: { [key: string]: RetrievalDocumentType } = {};

  if (action && action.type === "retrieval_action" && action.documents) {
    action.documents.forEach((d) => {
      references[d.reference] = d;
    });
  }

  if (references) {
    let counter = 0;
    const refCounter: { [key: string]: number } = {};
    return content.replace(/:cite\[[a-zA-Z0-9, ]+\]/g, (match) => {
      const keys = match.slice(6, -1).split(","); // slice off ":cite[" and "]" then split by comma
      return keys
        .map((key) => {
          const k = key.trim();
          const ref = references[k];
          if (ref) {
            if (!refCounter[k]) {
              counter++;
              refCounter[k] = counter;
            }
            const link = ref.sourceUrl
              ? ref.sourceUrl
              : `${DUST_API}/w/${
                  ref.dataSourceWorkspaceId
                }/builder/data-sources/${
                  ref.dataSourceId
                }/upsert?documentId=${encodeURIComponent(ref.documentId)}`;
            return `[<${link}|${refCounter[k]}>]`;
          }
          return "";
        })
        .join("");
    });
  }

  return _removeCiteMention(content);
}

function _removeCiteMention(message: string): string {
  const regex = /:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
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
