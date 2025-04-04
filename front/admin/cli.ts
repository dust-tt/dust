import parseArgs from "minimist";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { renderConversationForModel } from "@app/lib/api/assistant/generation";
import { getTextRepresentationFromMessages } from "@app/lib/api/assistant/utils";
import { default as config } from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { garbageCollectGoogleDriveDocument } from "@app/lib/api/poke/plugins/data_sources/garbage_collect_google_drive_document";
import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { getDustProdActionRegistry } from "@app/lib/registry";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
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

      const w = await Workspace.create({
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

      const w = await Workspace.findOne({
        where: {
          sId: `${args.wId}`,
        },
      });
      if (!w) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }

      await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
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
          sId: `${args.wId}`,
        },
      });
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
        const w = await Workspace.findOne({
          where: {
            sId: `${wId}`,
          },
        });
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
        const w = await Workspace.findOne({
          where: {
            sId: `${wId}`,
          },
        });
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
        "Possible values: `find`, `create`, `set-limits`, `upgrade`, `downgrade`"
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

      const convoRes = await renderConversationForModel(auth, {
        conversation,
        model,
        prompt,
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
                content: m.content.slice(0, 200) + "...",
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

export const CLI_OBJECT_TYPES = [
  "workspace",
  "user",
  "data-source",
  "conversation",
  "transcripts",
  "registry",
  "production-check",
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
