import fs from "fs/promises";
import parseArgs from "minimist";
import path from "path";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { getTextRepresentationFromMessages } from "@app/lib/api/assistant/utils";
import { default as config } from "@app/lib/api/config";
import {
  getDataSources,
  softDeleteDataSourceAndLaunchScrubWorkflow,
} from "@app/lib/api/data_sources";
import { garbageCollectGoogleDriveDocument } from "@app/lib/api/poke/plugins/data_sources/garbage_collect_google_drive_document";
import { Authenticator } from "@app/lib/auth";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { getDustProdActionRegistry } from "@app/lib/registry";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/transcripts/client";
import { REGISTERED_CHECKS } from "@app/temporal/production_checks/activities";
import {
  assertNever,
  ConnectorsAPI,
  isRoleType,
  removeNulls,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

// `cli` takes an object type and a command as first two arguments and then a list of arguments.
const workspace = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "create": {
      if (!args.name) {
        throw new Error("Missing --name argument");
      }

      const w = await WorkspaceResource.makeNew({
        sId: generateRandomModelSId(),
        name: args.name,
      });

      const lightWorkspace = renderLightWorkspaceType({ workspace: w });

      const { systemGroup, globalGroup } =
        await GroupResource.makeDefaultsForWorkspace(lightWorkspace);

      const auth = await Authenticator.internalAdminForWorkspace(
        lightWorkspace.sId
      );
      await SpaceResource.makeDefaultsForWorkspace(auth, {
        systemGroup,
        globalGroup,
      });

      args.wId = w.sId;
      return;
    }

    case "upgrade": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }

      const w = await WorkspaceResource.fetchById(args.wId);
      if (!w) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }

      await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
        workspaceId: w.sId,
        planCode: FREE_UPGRADED_PLAN_CODE,
        endDate: null,
      });
      await workspace("show", args);
      return;
    }

    case "downgrade": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }

      const w = await WorkspaceResource.fetchById(args.wId);
      if (!w) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }

      await SubscriptionResource.internalSubscribeWorkspaceToFreeNoPlan({
        workspaceId: w.sId,
      });
      await workspace("show", args);
      return;
    }

    case "pause-connectors": {
      if (!args.wIds && !args.wId) {
        throw new Error("Missing --wIds argument");
      }
      if (args.wIds && args.wId) {
        throw new Error("Cannot use --wIds and --wId together");
      }
      const wIds: string[] = args.wIds ? args.wIds.split(",") : [args.wId];

      for (const wId of wIds) {
        console.log(`Pausing connectors for workspace: wId=${wId}`);
        const w = await WorkspaceResource.fetchById(wId);
        if (!w) {
          throw new Error(`Workspace not found: wId='${args.wId}'`);
        }

        const auth = await Authenticator.internalAdminForWorkspace(w.sId);
        const dataSources = await getDataSources(auth);
        const connectorIds = removeNulls(dataSources.map((d) => d.connectorId));
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        for (const connectorId of connectorIds) {
          console.log(`Pausing connectorId=${connectorId}`);
          const res = await connectorsAPI.pauseConnector(connectorId);
          if (res.isErr()) {
            throw new Error(res.error.message);
          }
        }
      }

      console.log("Connectors paused");
      return;
    }

    case "unpause-connectors": {
      if (!args.wIds && !args.wId) {
        throw new Error("Missing --wIds argument");
      }
      if (args.wIds && args.wId) {
        throw new Error("Cannot use --wIds and --wId together");
      }
      const wIds: string[] = args.wIds ? args.wIds.split(",") : [args.wId];

      for (const wId of wIds) {
        const w = await WorkspaceResource.fetchById(wId);
        if (!w) {
          throw new Error(`Workspace not found: wId='${args.wId}'`);
        }
        console.log(`Unpausing connectors for workspace: wId=${w.sId}`);

        const auth = await Authenticator.internalAdminForWorkspace(w.sId);
        const dataSources = await getDataSources(auth);
        const connectorIds = removeNulls(dataSources.map((d) => d.connectorId));
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        for (const connectorId of connectorIds) {
          console.log(`Unpausing connectorId=${connectorId}`);
          const res = await connectorsAPI.unpauseConnector(connectorId);
          if (res.isErr()) {
            throw new Error(res.error.message);
          }
        }
      }

      console.log("Connectors unpaused");
      return;
    }

    default:
      console.log(`Unknown workspace command: ${command}`);
      console.log(
        "Possible values: `create`, `upgrade`, `downgrade`, `pause-connectors`, `unpause-connectors`"
      );
  }
};

const user = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "find": {
      if (!args.username) {
        throw new Error("Missing --username argument");
      }

      const users = await UserResource.listByUsername(args.username);

      users.forEach((u) => {
        console.log(
          `> id='${u.id}' username='${u.username}' name='${u.name}' email='${u.email}'`
        );
      });
      return;
    }
    case "show": {
      if (!args.userId) {
        throw new Error("Missing --userId argument");
      }

      const u = await UserResource.fetchByModelId(args.userId);
      if (!u) {
        throw new Error(`User not found: userId='${args.userId}'`);
      }

      console.log(`user:`);
      console.log(`  id: ${u.id}`);
      console.log(`  username: ${u.username}`);
      console.log(`  name: ${u.name}`);
      console.log(`  email: ${u.email}`);

      const { memberships } = await MembershipResource.getLatestMemberships({
        users: [u],
      });

      const workspaces = await WorkspaceResource.fetchByModelIds(
        memberships.map((m) => m.workspaceId)
      );

      console.log(`  workspaces:`);

      workspaces.forEach((w) => {
        const m = memberships.find((m) => m.workspaceId === w.id);
        console.log(`    - wId: ${w.sId}`);
        console.log(`      name: ${w.name}`);
        if (m) {
          console.log(`      role: ${m.isRevoked() ? "revoked" : m.role}`);
          console.log(`      startAt: ${m.startAt}`);
          console.log(`      endAt: ${m.endAt}`);
        }
      });

      return;
    }
    default:
      console.log(`Unknown user command: ${command}`);
      console.log("Possible values: `find`, `show`");
  }
};

const dataSource = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "delete-document": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
      if (!args.documentId) {
        throw new Error("Missing --documentId argument");
      }

      const auth = await Authenticator.internalAdminForWorkspace(args.wId);

      const dataSource = await DataSourceResource.fetchById(auth, args.dsId);
      if (!dataSource) {
        throw new Error(
          `DataSource not found: wId='${args.wId}' dsId='${args.dsId}'`
        );
      }

      const gcRes = await garbageCollectGoogleDriveDocument(dataSource, {
        documentId: args.documentId,
      });
      if (gcRes.isErr()) {
        throw new Error(`Error deleting document: ${gcRes.error.message}`);
      }

      console.log(`Data Source document deleted: ${args.documentId}`);

      return;
    }
    case "delete": {
      // It's possible to delete a data source directly from Poké UI but
      // it's not accessible for a relocated workspace. This command is there to let us
      // delete a data source for a relocated workspace.
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }

      const auth = await Authenticator.internalAdminForWorkspace(args.wId);

      const dataSource = await DataSourceResource.fetchById(auth, args.dsId, {
        includeDeleted: true,
      });
      if (!dataSource) {
        throw new Error(
          `DataSource not found: wId='${args.wId}' dsId='${args.dsId}'`
        );
      }

      await softDeleteDataSourceAndLaunchScrubWorkflow(auth, dataSource);

      console.log(`Data Source deleted: ${args.dsId}`);

      return;
    }

    default:
      console.log(`Unknown data-source command: ${command}`);
      console.log("Possible values: `delete`, `delete-document`");
  }
};

const conversation = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "render-for-model": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.cId) {
        throw new Error("Missing --cId argument");
      }
      if (!args.modelId) {
        throw new Error("Missing --modelId argument");
      }
      const model = SUPPORTED_MODEL_CONFIGS.find(
        (m) => m.modelId === args.modelId
      );
      if (!model) {
        throw new Error(`Model not found: '${args.modelId}'`);
      }
      const verbose = args.verbose === "true";

      const auth = await Authenticator.internalAdminForWorkspace(args.wId);
      const conversationRes = await getConversation(auth, args.cId as string);

      if (conversationRes.isErr()) {
        throw new Error(conversationRes.error.message);
      }
      const conversation = conversationRes.value;

      const MIN_GENERATION_TOKENS = 2048;
      const allowedTokenCount = model.contextSize - MIN_GENERATION_TOKENS;
      const prompt = "";
      const tools = "";

      const convoRes = await renderConversationForModel(auth, {
        conversation,
        model,
        prompt,
        tools,
        allowedTokenCount,
      });

      if (convoRes.isErr()) {
        throw new Error(convoRes.error.message);
      }
      const renderedConvo = convoRes.value;
      const messages = renderedConvo.modelConversation.messages;

      const tokenCountRes = await tokenCountForTexts(
        getTextRepresentationFromMessages(messages),
        model
      );
      if (tokenCountRes.isErr()) {
        throw new Error(tokenCountRes.error.message);
      }
      const tokenCount = tokenCountRes.value;

      console.log(
        `Token used: ${renderedConvo.tokensUsed} (this includes a margin of 64 tokens).`
      );
      console.log(
        `Number of messages: ${renderedConvo.modelConversation.messages.length}`
      );
      console.log(`Tokens per message: ${tokenCount}.`);

      if (verbose) {
        // For convenience we shorten the content when role = "tool"
        renderedConvo.modelConversation.messages =
          renderedConvo.modelConversation.messages.map((m) => {
            if (m.role === "function") {
              return {
                ...m,
                content:
                  typeof m.content === "string"
                    ? m.content.slice(0, 200) + "..."
                    : m.content,
              };
            }
            return m;
          });

        renderedConvo.modelConversation.messages.forEach((m) => {
          console.log(m);
        });
      } else {
        console.log(
          "Add option --verbose=true to print also the content of the messages."
        );
      }

      return;
    }
  }
};

// The active IDs file is a JSON array of string configuration sIds, e.g.:
// ["trc_...", "trc_...", ...]
// A config is considered 'active' if isActive === true OR dataSourceViewId is set (truthy).
// You can override the path with --activeIdsFile=/path/to/file.json
function getActiveIdsFile(args: parseArgs.ParsedArgs) {
  return args.activeIdsFile
    ? path.resolve(args.activeIdsFile)
    : path.join(__dirname, "active_labs_workflow_ids.json");
}

const transcripts = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "stop": {
      if (!args.cId) {
        throw new Error("Missing --cId argument");
      }
      const transcriptsConfiguration =
        await LabsTranscriptsConfigurationResource.fetchById(args.cId);

      if (!transcriptsConfiguration) {
        throw new Error(
          `Transcripts configuration not found: cId='${args.cId}'`
        );
      }

      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);

      logger.info(
        {
          transcriptsConfiguration,
        },
        "Transcript retrieval workflow stopped."
      );

      return;
    }
    case "start": {
      if (!args.cId) {
        throw new Error("Missing --cId argument");
      }
      const transcriptsConfiguration =
        await LabsTranscriptsConfigurationResource.fetchById(args.cId);

      if (!transcriptsConfiguration) {
        throw new Error(
          `Transcripts configuration not found: cId='${args.cId}'`
        );
      }

      await launchRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      await transcriptsConfiguration.setIsActive(true);

      logger.info(
        {
          transcriptsConfiguration,
        },
        "Transcript retrieval workflow started."
      );
      return;
    }
    case "pause-all": {
      const execute = !!args.execute;
      const activeIdsFile = getActiveIdsFile(args);
      logger.info(
        `Pausing all LabsTranscripts workflows and recording active ones... (activeIdsFile: ${activeIdsFile})`
      );
      const allWorkspaces = await WorkspaceResource.listAll();
      const activeConfigSIds: string[] = [];
      for (const ws of allWorkspaces) {
        const configs =
          await LabsTranscriptsConfigurationResource.findByWorkspaceId(ws.id);
        for (const config of configs) {
          if (config.isActive === true || !!config.dataSourceViewId) {
            activeConfigSIds.push(config.sId);
            if (execute) {
              await stopRetrieveTranscriptsWorkflow(config);
            } else {
              logger.info(
                `[DRY RUN] Would stop workflow for config sId=${config.sId}`
              );
            }
          }
        }
      }
      await fs.writeFile(
        activeIdsFile,
        JSON.stringify(activeConfigSIds, null, 2)
      );
      logger.info(
        `Paused all workflows. Active workflow sIds recorded: ${activeConfigSIds.length}`
      );
      return;
    }
    case "restart-active": {
      const execute = !!args.execute;
      const activeIdsFile = getActiveIdsFile(args);
      logger.info(
        `Restarting only previously active LabsTranscripts workflows... (activeIdsFile: ${activeIdsFile})`
      );
      let activeConfigSIds: string[] = [];
      try {
        const data = await fs.readFile(activeIdsFile, "utf-8");
        activeConfigSIds = JSON.parse(data);
      } catch (e) {
        logger.error(`Could not read ${activeIdsFile}: ${e}`);
        process.exit(1);
      }
      for (const sId of activeConfigSIds) {
        const config =
          await LabsTranscriptsConfigurationResource.fetchById(sId);
        if (!config) {
          logger.warn(`Config sId=${sId} not found, skipping.`);
          continue;
        }
        if (execute) {
          await launchRetrieveTranscriptsWorkflow(config);
        } else {
          logger.info(
            `[DRY RUN] Would restart workflow for config sId=${config.sId}`
          );
        }
      }
      logger.info(`Restarted ${activeConfigSIds.length} workflows.`);
      return;
    }
  }
};

const registry = async (command: string) => {
  switch (command) {
    case "dump": {
      console.log(JSON.stringify(getDustProdActionRegistry()));
      return;
    }

    default:
      console.log(`Unknown registry command: ${command}`);
      console.log("Possible values: `dump`");
  }
};

const productionCheck = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "run": {
      if (!args.check) {
        throw new Error("Missing --check argument");
      }

      const check = REGISTERED_CHECKS.find((c) => c.name === args.check);
      if (!check) {
        console.log(args.check);
        throw new Error(
          `Invalid check, possible values: ${REGISTERED_CHECKS.map((c) => c.name).join(", ")}`
        );
      }

      const reportSuccess = (reportPayload: unknown) => {
        logger.info({ reportPayload }, "Check succeeded");
      };
      const reportFailure = (reportPayload: unknown, message: string) => {
        logger.error(
          { reportPayload, errorMessage: message },
          "Production check failed"
        );
      };
      const heartbeat = () => {};

      await check.check(
        check.name,
        logger,
        reportSuccess,
        reportFailure,
        heartbeat
      );
      return;
    }
  }
};

async function apikeys(command: string, args: parseArgs.ParsedArgs) {
  switch (command) {
    case "set-role": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }

      if (!args.name) {
        throw new Error("Missing --name argument");
      }

      if (!args.role || !isRoleType(args.role)) {
        throw new Error(
          "Missing or Incorrect --role argument. Must be admin | user | builder."
        );
      }

      const auth = await Authenticator.internalAdminForWorkspace(
        String(args.wId)
      );

      const key = await KeyResource.fetchByName(auth, { name: args.name });
      if (!key) {
        throw new Error(`Key not found`);
      }

      await key.updateRole({
        newRole: args.role,
      });

      return;
    }
  }
}

export const CLI_OBJECT_TYPES = [
  "workspace",
  "user",
  "data-source",
  "conversation",
  "transcripts",
  "registry",
  "production-check",
  "api-key",
] as const;

export type CliObjectType = (typeof CLI_OBJECT_TYPES)[number];

export function isCliObjectType(val: string): val is CliObjectType {
  return (CLI_OBJECT_TYPES as unknown as string[]).includes(val);
}

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 2) {
    console.log(
      "Expects object type and command as first two arguments, eg: `cli workspace create ...`"
    );
    return;
  }

  const [objectType, command] = argv._;

  if (!isCliObjectType(objectType)) {
    console.log(
      "Unknown object type, possible values: " + CLI_OBJECT_TYPES.join(", ")
    );
    return;
  }

  switch (objectType) {
    case "workspace":
      await workspace(command, argv);
      return;
    case "user":
      await user(command, argv);
      return;
    case "data-source":
      await dataSource(command, argv);
      return;
    case "conversation":
      return conversation(command, argv);
    case "transcripts":
      return transcripts(command, argv);
    case "registry":
      return registry(command);
    case "production-check":
      return productionCheck(command, argv);
    case "api-key":
      return apikeys(command, argv);
    default:
      assertNever(objectType);
  }
};

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });
