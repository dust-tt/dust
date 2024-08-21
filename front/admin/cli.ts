import type { DustRegistryActionName } from "@dust-tt/types";
import {
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  ConnectorsAPI,
  DustProdActionRegistry,
  removeNulls,
  SUPPORTED_MODEL_CONFIGS,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { Storage } from "@google-cloud/storage";
import parseArgs from "minimist";
import readline from "readline";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { renderConversationForModelMultiActions } from "@app/lib/api/assistant/generation";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import {
  internalSubscribeWorkspaceToFreeNoPlan,
  internalSubscribeWorkspaceToFreePlan,
} from "@app/lib/plans/subscription";
import { GroupResource } from "@app/lib/resources/group_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import {
  launchRetrieveTranscriptsWorkflow,
  stopRetrieveTranscriptsWorkflow,
} from "@app/temporal/labs/client";

// `cli` takes an object type and a command as first two arguments and then a list of arguments.
const workspace = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "create": {
      if (!args.name) {
        throw new Error("Missing --name argument");
      }

      const w = await Workspace.create({
        sId: generateLegacyModelSId(),
        name: args.name,
      });

      const lightWorkspace = renderLightWorkspaceType({ workspace: w });

      const { systemGroup, globalGroup } =
        await GroupResource.makeDefaultsForWorkspace(lightWorkspace);

      await VaultResource.makeDefaultsForWorkspace(lightWorkspace, {
        systemGroup,
        globalGroup,
      });

      args.wId = w.sId;
      await workspace("show", args);
      return;
    }

    case "upgrade": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }

      const w = await Workspace.findOne({
        where: {
          sId: args.wId,
        },
      });
      if (!w) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }

      await internalSubscribeWorkspaceToFreePlan({
        workspaceId: w.sId,
        planCode: FREE_UPGRADED_PLAN_CODE,
      });
      await workspace("show", args);
      return;
    }

    case "downgrade": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }

      const w = await Workspace.findOne({
        where: {
          sId: args.wId,
        },
      });
      if (!w) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }

      await internalSubscribeWorkspaceToFreeNoPlan({
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
        const w = await Workspace.findOne({
          where: {
            sId: wId,
          },
        });
        if (!w) {
          throw new Error(`Workspace not found: wId='${args.wId}'`);
        }

        const auth = await Authenticator.internalBuilderForWorkspace(w.sId);
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
        const w = await Workspace.findOne({
          where: {
            sId: wId,
          },
        });
        if (!w) {
          throw new Error(`Workspace not found: wId='${args.wId}'`);
        }
        console.log(`Unpausing connectors for workspace: wId=${w.sId}`);

        const auth = await Authenticator.internalBuilderForWorkspace(w.sId);
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
        "Possible values: `find`, `show`, `create`, `set-limits`, `upgrade`, `downgrade`"
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

      const memberships = await MembershipResource.getLatestMemberships({
        users: [u],
      });

      const workspaces = await Workspace.findAll({
        where: {
          id: memberships.map((m) => m.workspaceId),
        },
      });

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
    case "delete": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.name) {
        throw new Error("Missing --name argument");
      }
      const workspace = await Workspace.findOne({
        where: {
          sId: args.wId,
        },
      });
      if (!workspace) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }

      const dataSource = await DataSource.findOne({
        where: {
          workspaceId: workspace.id,
          name: args.name,
        },
      });
      if (!dataSource) {
        throw new Error(
          `DataSource not found: wId='${args.wId}' name='${args.name}'`
        );
      }

      const dustAPIProjectId = dataSource.dustAPIProjectId;

      await new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question(
          `Are you sure you want to definitely delete the following data source and all associated data: wId='${args.wId}' name='${args.name}' provider='${dataSource.connectorProvider}'? (y/N) `,
          (answer: string) => {
            rl.close();
            if (answer !== "y") {
              throw new Error("Aborting");
            }
            resolve(null);
          }
        );
      });

      if (dataSource.connectorId) {
        console.log(`Deleting connectorId=${dataSource.connectorId}}`);
        const connDeleteRes = await new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        ).deleteConnector(dataSource.connectorId.toString(), true);
        if (connDeleteRes.isErr()) {
          throw new Error(connDeleteRes.error.message);
        }
      }
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

      const coreDeleteRes = await coreAPI.deleteDataSource({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
      });
      if (coreDeleteRes.isErr()) {
        throw new Error(coreDeleteRes.error.message);
      }

      await dataSource.destroy();

      console.log("Data source deleted. Make sure to run: \n\n");
      console.log(
        "\x1b[32m%s\x1b[0m",
        `./admin/cli.sh data-source scrub --dustAPIProjectId ${dustAPIProjectId}`
      );
      console.log(
        "\n\n...to fully scrub the customer data from our infra (GCS clean-up)."
      );
      console.log(`WARNING: For Github datasource, the user may want to uninstall the app from Github
      to revoke the authorization. If needed, send an email (cf template in lib/email.ts) `);
      return;
    }

    case "scrub": {
      if (!args.dustAPIProjectId) {
        throw new Error("Missing --dustAPIProjectId argument");
      }

      const storage = new Storage({ keyFilename: config.getServiceAccount() });

      const [files] = await storage
        .bucket(config.getDustDataSourcesBucket())
        .getFiles({ prefix: `${args.dustAPIProjectId}` });

      console.log(`Chunking ${files.length} files...`);
      const chunkSize = 32;
      const chunks = [];
      for (let i = 0; i < files.length; i += chunkSize) {
        chunks.push(files.slice(i, i + chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i}/${chunks.length}...`);
        const chunk = chunks[i];
        if (!chunk) {
          continue;
        }
        await Promise.all(
          chunk.map((f) => {
            return (async () => {
              console.log(`Deleting file: ${f.name}`);
              await f.delete();
            })();
          })
        );
      }

      return;
    }

    case "delete-document": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.name) {
        throw new Error("Missing --name argument");
      }
      if (!args.documentId) {
        throw new Error("Missing --documentId argument");
      }
      const workspace = await Workspace.findOne({
        where: {
          sId: args.wId,
        },
      });
      if (!workspace) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }

      const dataSource = await DataSource.findOne({
        where: {
          workspaceId: workspace.id,
          name: args.name,
        },
      });
      if (!dataSource) {
        throw new Error(
          `DataSource not found: wId='${args.wId}' name='${args.name}'`
        );
      }

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const getRes = await coreAPI.getDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        documentId: args.documentId,
      });
      if (getRes.isErr()) {
        throw new Error(
          `Error while getting the document: ` + getRes.error.message
        );
      }
      const delRes = await coreAPI.deleteDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        documentId: args.documentId,
      });
      if (delRes.isErr()) {
        throw new Error(`Error deleting document: ${delRes.error.message}`);
      }
      console.log(`Data Source document deleted: ${args.documentId}`);

      return;
    }

    default:
      console.log(`Unknown data-source command: ${command}`);
      console.log("Possible values: `delete`, `scrub`");
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
      const verbose = args.verbose === "true";

      const modelId =
        args.modelId ?? CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.modelId;
      const model = SUPPORTED_MODEL_CONFIGS.find((m) => m.modelId === modelId);
      if (!model) {
        throw new Error(`Model not found: modelId='${modelId}'`);
      }

      const auth = await Authenticator.internalAdminForWorkspace(args.wId);
      const conversation = await getConversation(auth, args.cId as string);

      if (!conversation) {
        throw new Error(`Conversation not found: cId='${args.cId}'`);
      }

      const MIN_GENERATION_TOKENS = 2048;
      const allowedTokenCount = model.contextSize - MIN_GENERATION_TOKENS;
      const prompt = "";

      const response = await renderConversationForModelMultiActions({
        conversation,
        model,
        prompt,
        allowedTokenCount,
      });

      if (response.isErr()) {
        logger.error(response.error.message);
      } else {
        logger.info(
          {
            model,
            prompt,
          },
          "Called renderConversationForModel with params:"
        );
        const result = response.value;

        if (!verbose) {
          // For convenience we shorten the content when role = "tool"
          result.modelConversation.messages =
            result.modelConversation.messages.map((m) => {
              if (m.role === "function") {
                return {
                  ...m,
                  content: m.content.slice(0, 200) + "...",
                };
              }
              return m;
            });
        }

        logger.info(result, "Result from renderConversationForModel:");
      }
      return;
    }
  }
};

const transcripts = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "stop": {
      if (!args.cId) {
        throw new Error("Missing --cId argument");
      }
      const transcriptsConfiguration =
        await LabsTranscriptsConfigurationResource.fetchByModelId(args.cId);

      if (!transcriptsConfiguration) {
        throw new Error(
          `Transcripts configuration not found: cId='${args.cId}'`
        );
      }

      await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
      await transcriptsConfiguration.setIsActive(false);

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
        await LabsTranscriptsConfigurationResource.fetchByModelId(args.cId);

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
    }
  }
};

const registry = async (command: string) => {
  switch (command) {
    case "dump": {
      console.log(JSON.stringify(DustProdActionRegistry));
      return;
    }

    default:
      console.log(`Unknown registry command: ${command}`);
      console.log("Possible values: `dump`");
  }
};

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 2) {
    console.log(
      "Expects object type and command as first two arguments, eg: `cli workspace create ...`"
    );
    console.log(
      "Possible object types: `workspace`, `user`, `data-source`, `conversation`"
    );
    return;
  }

  const [objectType, command] = argv._;

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
    default:
      console.log(
        "Unknown object type, possible values: `workspace`, `user`, `data-source`, `event-schema`, `conversation`, `transcripts`"
      );
      return;
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
