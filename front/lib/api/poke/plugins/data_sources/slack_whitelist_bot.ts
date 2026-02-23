import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import { GroupResource } from "@app/lib/resources/group_resource";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types/connectors/admin/cli";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

type SlackWhitelistConfig = {
  id: string;
  name: string;
  description: string;
  providerType: "slack" | "slack_bot";
  whitelistType: "index_messages" | "summon_agent";
};

function makeSlackWhitelistBotPlugin(cfg: SlackWhitelistConfig) {
  return createPlugin({
    manifest: {
      id: cfg.id,
      name: cfg.name,
      description: cfg.description,
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
          description: "Groups to associate with the whitelisted bot",
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
      return resource.connectorProvider === cfg.providerType;
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

      if (!groupIds.includes(workspaceGroupRes.value.sId)) {
        groupIds.push(workspaceGroupRes.value.sId);
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
          groupId: groupIds.join(","),
          whitelistType: cfg.whitelistType,
          providerType: cfg.providerType,
        },
      };

      const adminCommandRes = await connectorsAPI.admin(whitelistBotCmd);
      if (adminCommandRes.isErr()) {
        return new Err(
          new Error(`Failed to whitelist bot: ${adminCommandRes.error.message}`)
        );
      }

      const isEU = regionsConfig.getCurrentRegion() === "europe-west1";
      const metabaseUrl = isEU
        ? `https://eu.metabase.dust.tt/question/46-whitelisted-bots-given-connector?connectorId=${resource.connectorId}`
        : `https://metabase.dust.tt/question/637-whitelisted-bots-given-connector?connectorId=${resource.connectorId}`;

      return new Ok({
        display: "textWithLink",
        value: `Successfully whitelisted Slack bot "${botName}" for ${cfg.whitelistType} in the selected group and the Workspace group.`,
        link: metabaseUrl,
        linkText: "View all whitelisted bots for this workspace",
      });
    },
  });
}

export const slackIndexBotMessagesPlugin = makeSlackWhitelistBotPlugin({
  id: "slack-index-bot-messages",
  name: "Whitelist Slack bot message indexing",
  description:
    "Whitelist a Slack bot or workflow so its messages are indexed and searchable in Dust",
  providerType: "slack",
  whitelistType: "index_messages",
});

export const slackWhitelistBotPlugin = makeSlackWhitelistBotPlugin({
  id: "slack-whitelist-bot-summoning",
  name: "Whitelist Slack bot agent summoning",
  description: "Whitelist a Slack bot or workflow so it can summon dust agents",
  providerType: "slack_bot",
  whitelistType: "summon_agent",
});
