import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import { GroupResource } from "@app/lib/resources/group_resource";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const slackWhitelistBotPlugin = createPlugin({
  manifest: {
    id: "slack-whitelist-bot",
    name: "Whitelist Slack Bot",
    description:
      "Whitelist a Slack bot or workflow for agent summoning or message indexing",
    resourceTypes: ["data_sources"],
    args: {
      botName: {
        type: "string",
        label: "Bot/Workflow Name",
        description: "Name of the Slack bot or workflow to whitelist",
      },
      whitelistType: {
        type: "enum",
        label: "Whitelist Type",
        description: "Type of whitelisting to apply",
        values: [],
        async: true,
        multiple: false,
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
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    // Plugin is available for both slack and slack_bot providers.
    return ["slack", "slack_bot"].includes(resource.connectorProvider ?? "");
  },
  populateAsyncArgs: async (auth, resource) => {
    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    const groups = await GroupResource.listAllWorkspaceGroups(auth);

    // Filter whitelist types based on connector provider
    // - slack provider: supports both summon_agent and index_messages
    // - slack_bot provider: only supports summon_agent
    const availableWhitelistTypes =
      resource.connectorProvider === "slack"
        ? ["summon_agent", "index_messages"]
        : ["summon_agent"];

    return new Ok({
      whitelistType: availableWhitelistTypes.map((type) => ({
        value: type,
        label: type,
      })),
      groupIds: groups.map((group) => ({
        value: group.sId,
        label: group.name,
      })),
    });
  },
  execute: async (auth, resource, args) => {
    const owner = auth.getNonNullableWorkspace();
    const { botName, whitelistType, groupIds } = args;

    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    if (!botName.trim()) {
      return new Err(new Error("Bot name is required"));
    }

    if (!groupIds || groupIds.length === 0) {
      return new Err(new Error("Groups selection is required"));
    }

    if (!resource.connectorProvider) {
      return new Err(new Error("Provider type is required"));
    }

    // Validate whitelist type based on connector provider
    if (
      resource.connectorProvider === "slack_bot" &&
      whitelistType[0] === "index_messages"
    ) {
      return new Err(
        new Error(
          "index_messages whitelist type is only available for slack provider, not slack_bot"
        )
      );
    }

    // Always include the Workspace (global) group
    const workspaceGroupRes =
      await GroupResource.fetchWorkspaceGlobalGroup(auth);
    if (workspaceGroupRes.isErr()) {
      return new Err(new Error("Failed to fetch workspace global group"));
    }

    // Combine the selected group with the Workspace group (avoid duplicates)
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
        whitelistType: whitelistType[0],
        providerType: resource.connectorProvider,
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
      value:
        `Successfully whitelisted Slack bot "${botName}" for ${whitelistType} in the ` +
        "selected group and the Workspace group.",
      link: metabaseUrl,
      linkText: "View all whitelisted bots for this workspace",
    });
  },
});
