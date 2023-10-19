import { Storage } from "@google-cloud/storage";
import parseArgs from "minimist";
import readline from "readline";

import { downgradeWorkspace, upgradeWorkspace } from "@app/lib/api/workspace";
import { planForWorkspace } from "@app/lib/auth";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import { CoreAPI } from "@app/lib/core_api";
import {
  DataSource,
  EventSchema,
  Membership,
  User,
  Workspace,
} from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";

const { DUST_DATA_SOURCES_BUCKET = "", SERVICE_ACCOUNT } = process.env;

// `cli` takes an object type and a command as first two arguments and then a list of arguments.
const workspace = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "find": {
      if (!args.name) {
        throw new Error("Missing --name argument");
      }

      const workspaces = await Workspace.findAll({
        where: {
          name: args.name,
        },
      });


      return;
    }

    case "show": {
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


      const plan = planForWorkspace(w);

      const dataSources = await DataSource.findAll({
        where: {
          workspaceId: w.id,
        },
      });


      const memberships = await Membership.findAll({
        where: {
          workspaceId: w.id,
        },
      });
      const users = await User.findAll({
        where: {
          id: memberships.map((m) => m.userId),
        },
      });



      return;
    }

    case "create": {
      if (!args.name) {
        throw new Error("Missing --name argument");
      }

      const w = await Workspace.create({
        sId: generateModelSId(),
        name: args.name,
      });

      args.wId = w.sId;
      await workspace("show", args);
      return;
    }

    case "set-limits": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.limit) {
        throw new Error("Missing --limit argument");
      }
      if (!args.value) {
        throw new Error("Missing --value argument");
      }

      if (args.value === "inf") {
        args.value = -1;
      }

      if (!Number.isInteger(args.value)) {
        throw new Error(`--value must be an integer: ${args.value}`);
      }

      const w = await Workspace.findOne({
        where: {
          sId: args.wId,
        },
      });
      if (!w) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }

      let plan = {} as any;
      if (w.plan) {
        try {
          plan = JSON.parse(w.plan);
        } catch (err) {
        }
      }

      if (!plan.limits) {
        plan.limits = {};
      }
      if (!plan.limits.dataSources) {
        plan.limits.dataSources = {};
      }

      switch (args.limit) {
        case "dataSources.count":
          plan.limits.dataSources.count = args.value;
          break;
        case "dataSources.managed":
          switch (args.value) {
            case 1:
              plan.limits.dataSources.managed = true;
              break;
            default:
              plan.limits.dataSources.managed = false;
          }
          break;
        case "dataSources.documents.count":
          if (!plan.limits.dataSources.documents) {
            plan.limits.dataSources.documents = {};
          }
          plan.limits.dataSources.documents.count = args.value;
          break;
        case "dataSources.documents.sizeMb":
          if (!plan.limits.dataSources.documents) {
            plan.limits.dataSources.documents = {};
          }
          plan.limits.dataSources.documents.sizeMb = args.value;
          break;
        default:
          throw new Error(`Unknown --limit: ${args.limit}`);
      }

      w.plan = JSON.stringify(plan);
      await w.save();

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

      await upgradeWorkspace(w.id);
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

      await downgradeWorkspace(w.id);
      await workspace("show", args);
      return;
    }

    case "add-user": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.userId) {
        throw new Error("Missing --userId argument");
      }
      if (!args.role) {
        throw new Error("Missing --role argument");
      }
      if (!["admin", "builder", "user"].includes(args.role)) {
        throw new Error(`Invalid --role: ${args.role}`);
      }
      const role = args.role as "admin" | "builder" | "user";

      const w = await Workspace.findOne({
        where: {
          sId: args.wId,
        },
      });
      if (!w) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }
      const u = await User.findOne({
        where: {
          id: args.userId,
        },
      });
      if (!u) {
        throw new Error(`User not found: userId='${args.userId}'`);
      }
      await Membership.create({
        role,
        workspaceId: w.id,
        userId: u.id,
      });
      return;
    }

    case "change-role": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.userId) {
        throw new Error("Missing --userId argument");
      }
      if (!args.role) {
        throw new Error("Missing --role argument");
      }
      if (!["admin", "builder", "user", "revoked"].includes(args.role)) {
        throw new Error(`Invalid --role: ${args.role}`);
      }
      const role = args.role as "admin" | "builder" | "user" | "revoked";

      const w = await Workspace.findOne({
        where: {
          sId: args.wId,
        },
      });
      if (!w) {
        throw new Error(`Workspace not found: wId='${args.wId}'`);
      }
      const u = await User.findOne({
        where: {
          id: args.userId,
        },
      });
      if (!u) {
        throw new Error(`User not found: userId='${args.userId}'`);
      }
      const m = await Membership.findOne({
        where: {
          workspaceId: w.id,
          userId: u.id,
        },
      });
      if (!m) {
        throw new Error(
          `User is not a member of workspace: userId='${args.userId}' wId='${args.wId}'`
        );
      }

      m.role = role;
      await m.save();
      return;
    }

    default:
      
  }
};

const user = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "find": {
      if (!args.username) {
        throw new Error("Missing --username argument");
      }

      const users = await User.findAll({
        where: {
          username: args.username,
        },
      });


      return;
    }
    case "show": {
      if (!args.userId) {
        throw new Error("Missing --userId argument");
      }

      const u = await User.findOne({
        where: {
          id: args.userId,
        },
      });

      if (!u) {
        throw new Error(`User not found: userId='${args.userId}'`);
      }



      const memberships = await Membership.findAll({
        where: {
          userId: u.id,
        },
      });

      const workspaces = await Workspace.findAll({
        where: {
          id: memberships.map((m) => m.workspaceId),
        },
      });



      return;
    }
    default:
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
        const connDeleteRes = await ConnectorsAPI.deleteConnector(
          dataSource.connectorId.toString(),
          true
        );
        if (connDeleteRes.isErr()) {
          throw new Error(connDeleteRes.error.error.message);
        }
      }

      const coreDeleteRes = await CoreAPI.deleteDataSource({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
      });
      if (coreDeleteRes.isErr()) {
        throw new Error(coreDeleteRes.error.message);
      }

      await dataSource.destroy();


      return;
    }

    case "scrub": {
      if (!args.dustAPIProjectId) {
        throw new Error("Missing --dustAPIProjectId argument");
      }

      const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });

      const [files] = await storage
        .bucket(DUST_DATA_SOURCES_BUCKET)
        .getFiles({ prefix: `${args.dustAPIProjectId}` });

      const chunkSize = 32;
      const chunks = [];
      for (let i = 0; i < files.length; i += chunkSize) {
        chunks.push(files.slice(i, i + chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) {
          continue;
        }
        await Promise.all(
          chunk.map((f) => {
            return (async () => {
              await f.delete();
            })();
          })
        );
      }

      return;
    }

    default:
      
  }
};

const eventSchema = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "create": {
      if (!args.marker) {
        throw new Error("Missing --marker argument");
      }
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.uId) {
        throw new Error("Missing --uId argument");
      }
      if (!args.properties) {
        throw new Error("Missing --properties argument");
      }
      const schema = await EventSchema.create({
        sId: generateModelSId(),
        marker: args.marker,
        workspaceId: args.wId,
        userId: args.uId,
        properties: JSON.parse(args.properties),
        status: "active",
        debug: true,
      });
      args.eventSchemaId = schema.id;
      await eventSchema("show", args);
      return;
    }
    case "delete": {
      if (!args.eventSchemaId) {
        throw new Error("Missing --eventSchemaId argument");
      }
      const nbRowsDestroyed = await EventSchema.destroy({
        where: {
          id: args.eventSchemaId,
        },
      });

      return;
    }
    case "show": {
      if (!args.eventSchemaId) {
        throw new Error("Missing --eventSchemaId argument");
      }
      const schema = await EventSchema.findOne({
        where: {
          id: args.eventSchemaId,
        },
      });
      if (!schema) {
        throw new Error(`EventSchema not found: id='${args.eventSchemaId}'`);
      }
      
      return;
    }
    case "list": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      const schemas = await EventSchema.findAll({
        where: {
          workspaceId: args.wId,
        },
        order: [["createdAt", "ASC"]],
      });
      await Promise.all(
        schemas.map(async (s: EventSchema) => {
          args.eventSchemaId = s.id;
          return await eventSchema("show", args);
        })
      );
      return;
    }
  }
};

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 2) {
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
    case "event-schema":
      await eventSchema(command, argv);
      return;
    default:
      
      return;
  }
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    process.exit(1);
  });
