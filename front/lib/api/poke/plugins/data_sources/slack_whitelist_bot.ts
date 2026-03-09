import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import { GroupResource } from "@app/lib/resources/group_resource";
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
      groupIds: {
        type: "enum",
        label: "Groups",
        description:
          "Groups the bot can access when summoning agents — only agents belonging to these groups will be available to the bot",
        async: true,
        values: [],
        multiple: true,
      },
    },
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

    const groups = await GroupResource.listAllWorkspaceGroups(auth);

    return new Ok({
      groupIds: groups.map((group) => ({
        value: group.sId,
        label: group.name,
      })),
    });
  },
  execute: async (auth, resource, args) => {
    const owner = auth.getNonNullableWorkspace();
    const { botName, groupIds } = args;

    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    if (!botName.trim()) {
      return new Err(new Error("Bot name is required"));
    }

    if (!groupIds || groupIds.length === 0) {
      return new Err(new Error("Groups selection is required"));
    }

    // Always include the Workspace (global) group.
    const workspaceGroupRes =
      await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (workspaceGroupRes.isErr()) {
      return new Err(new Error("Failed to fetch workspace global group"));
    }

    const allGroupIds = groupIds.includes(workspaceGroupRes.value.sId)
      ? groupIds
      : [...groupIds, workspaceGroupRes.value.sId];

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
        groupId: allGroupIds.join(","),
        whitelistType: "summon_agent",
        providerType: "slack_bot",
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
      value: `Successfully whitelisted Slack bot "${botName}" for agent summoning in the selected groups and the Workspace group.`,
      link: getMetabaseUrl(resource.connectorId),
      linkText: "View all whitelisted bots for this workspace",
    });
  },
});
