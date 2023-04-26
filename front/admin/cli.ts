import parseArgs from "minimist";

import { planForWorkspace } from "@app/lib/auth";
import { Membership, User, Workspace } from "@app/lib/models";
import { new_id } from "@app/lib/utils";

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

      workspaces.forEach((w) => {
        console.log(`> wId='${w.sId}' name='${w.name}'`);
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

      console.log(`workspace:`);
      console.log(`  wId: ${w.sId}`);
      console.log(`  name: ${w.name}`);
      console.log(`  type: ${w.type}`);

      let plan = planForWorkspace(w);
      console.log(`  plan:`);
      console.log(`    limits:`);
      console.log(`      dataSources:`);
      console.log(`        count:    ${plan.limits.dataSources.count}`);
      console.log(`        documents:`);
      console.log(
        `          count:  ${plan.limits.dataSources.documents.count}`
      );
      console.log(
        `          sizeMb: ${plan.limits.dataSources.documents.sizeMb}`
      );
      return;
    }
    case "create": {
      if (!args.name) {
        throw new Error("Missing --name argument");
      }

      let uId = new_id();

      const w = await Workspace.create({
        uId,
        sId: uId.slice(0, 10),
        name: args.name,
        type: "team",
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
          console.log("Ignoring existing plan since not parseable JSON.");
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
            case "t":
            case "true":
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
      let role = args.role as "admin" | "builder" | "user";

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
      const m = await Membership.create({
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
      let role = args.role as "admin" | "builder" | "user" | "revoked";

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
      throw new Error(`Unknown workspace command: ${command}`);
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

      const u = await User.findOne({
        where: {
          id: args.userId,
        },
      });

      if (!u) {
        throw new Error(`User not found: userId='${args.userId}'`);
      }

      console.log(`user:`);
      console.log(`  id: ${u.id}`);
      console.log(`  username: ${u.username}`);
      console.log(`  name: ${u.name}`);
      console.log(`  email: ${u.email}`);

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

      console.log(`  workspaces:`);

      workspaces.forEach((w) => {
        let m = memberships.find((m) => m.workspaceId === w.id);
        console.log(`    - wId: ${w.sId}`);
        console.log(`      name: ${w.name}`);
        if (m) {
          console.log(`      role: ${m.role}`);
        }
      });

      return;
    }
    default:
      throw new Error(`Unknown user command: ${command}`);
  }
};

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 2) {
    throw new Error(
      "Expects object type and command as first two arguments, eg: `cli workspace create ...`"
    );
  }

  const [objectType, command] = argv._;

  switch (objectType) {
    case "workspace":
      await workspace(command, argv);
      return;
    case "user":
      await user(command, argv);
      return;
    default:
      throw new Error(`Unknown object type: ${objectType}`);
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
