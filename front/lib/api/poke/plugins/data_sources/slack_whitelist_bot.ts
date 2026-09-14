import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import {
  allowSlackWorkflow,
  listSlackWorkflowSpaces,
} from "@app/lib/api/slack/summoning_whitelist";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types/connectors/admin/cli";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

function getMetabaseUrl(connectorId: string | null) {
  const isEU = regionsConfig.getCurrentRegion() === "europe-west1";
  return isEU
    ? `https://eu.metabase.dust.tt/question/46-whitelisted-bots-given-connector?connectorId=${connectorId}`
    : `https://metabase.dust.tt/question/637-whitelisted-bots-given-connector?connectorId=${connectorId}`;
}

export const slackIndexBotMessagesPlugin = createPlugin({
  manifest: {
    id: "slack-index-bot-messages",
    name: "Whitelist Slack bot message indexing",
    description:
      "Whitelist a Slack bot or workflow so its messages are indexed and searchable in Dust",
    resourceTypes: ["data_sources"],
    args: {
      botName: {
        type: "string",
        label: "Bot/Workflow Name",
        description: "Name of the Slack bot or workflow to whitelist",
      },
    },
    requiredRoles: ["support"],
  },
  isApplicableTo: (_auth, resource) => {
    if (!resource) {
      return false;
    }
    return resource.connectorProvider === "slack";
  },
  execute: async (auth, resource, args) => {
    const owner = auth.getNonNullableWorkspace();
    const { botName } = args;

    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    if (!botName.trim()) {
      return new Err(new Error("Bot name is required"));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const whitelistBotCmd: AdminCommandType = {
      majorCommand: "slack",
      command: "whitelist-bot",
      args: {
        botName,
        wId: owner.sId,
        whitelistType: "index_messages",
        providerType: "slack",
      },
    };

    const adminCommandRes = await connectorsAPI.admin(whitelistBotCmd);
    if (adminCommandRes.isErr()) {
      return new Err(
        new Error(`Failed to whitelist bot: ${adminCommandRes.error.message}`)
      );
    }

    return new Ok({
      display: "textWithLink",
      value: `Successfully whitelisted Slack bot "${botName}" for message indexing.`,
      link: getMetabaseUrl(resource.connectorId),
      linkText: "View all whitelisted bots for this workspace",
    });
  },
});

export const slackWhitelistBotPlugin = createPlugin({
  manifest: {
    id: "slack-whitelist-bot-summoning",
    name: "Whitelist Slack bot agent summoning",
    description:
      "Whitelist a Slack bot or workflow so it can summon dust agents",
    resourceTypes: ["data_sources"],
    args: {
      botName: {
        type: "string",
        label: "Bot/Workflow Name",
        description: "Name of the Slack bot or workflow to whitelist",
      },
      spaceIds: {
        type: "enum",
        label: "Spaces",
        description:
          "Spaces the bot can reach when summoning agents — only agents shared in these spaces, plus the Company Space, will be available to the bot",
        async: true,
        values: [],
        multiple: true,
      },
    },
    requiredRoles: ["support"],
  },
  isApplicableTo: (_auth, resource) => {
    if (!resource) {
      return false;
    }
    return resource.connectorProvider === "slack_bot";
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    const spaces = await listSlackWorkflowSpaces(auth);

    return new Ok({
      spaceIds: spaces.map((space) => ({
        value: space.sId,
        label: space.name,
      })),
    });
  },
  execute: async (auth, resource, args) => {
    const { botName, spaceIds } = args;

    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    if (!botName.trim()) {
      return new Err(new Error("Bot name is required"));
    }

    const allowRes = await allowSlackWorkflow(auth, {
      botName: botName.trim(),
      spaceIds: spaceIds ?? [],
    });
    if (allowRes.isErr()) {
      return new Err(
        new Error(`Failed to whitelist bot: ${allowRes.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: `Successfully whitelisted Slack bot "${botName}" for agent summoning in the selected spaces and the Company Space.`,
    });
  },
});
