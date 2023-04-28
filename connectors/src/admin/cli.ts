import parseArgs from "minimist";

import {
  RESUME_CONNECTOR_BY_TYPE,
  STOP_CONNECTOR_BY_TYPE,
  SYNC_CONNECTOR_BY_TYPE,
} from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { isConnectorProvider } from "@connectors/types/connector";

const connectors = async (command: string, args: parseArgs.ParsedArgs) => {
  if (!args.provider) {
    throw new Error("Missing --provider argument");
  }
  if (!isConnectorProvider(args.provider)) {
    throw new Error(`Unknown provider: ${args.provider}`);
  }
  if (!args.wId) {
    throw new Error("Missing --wId argument");
  }

  const connector = await Connector.findOne({
    where: {
      type: args.provider,
      workspaceId: args.wId,
    },
  });

  if (!connector) {
    throw new Error(
      `Could not find connector for provider ${args.provider} and workspace ${args.wId}`
    );
  }
  switch (command) {
    case "stop": {
      await STOP_CONNECTOR_BY_TYPE[args.provider]({
        workspaceId: connector.workspaceId,
        dataSourceName: connector.dataSourceName,
      });
      return;
    }
    case "resume": {
      await RESUME_CONNECTOR_BY_TYPE[args.provider](
        {
          workspaceId: connector.workspaceId,
          dataSourceName: connector.dataSourceName,
          workspaceAPIKey: connector.workspaceAPIKey,
        },
        connector.nangoConnectionId
      );
      return;
    }
    case "full-resync": {
      await SYNC_CONNECTOR_BY_TYPE[args.provider](connector.id.toString());
      return;
    }
    case "restart": {
      await STOP_CONNECTOR_BY_TYPE[args.provider]({
        workspaceId: connector.workspaceId,
        dataSourceName: connector.dataSourceName,
      });
      await RESUME_CONNECTOR_BY_TYPE[args.provider](
        {
          workspaceId: connector.workspaceId,
          dataSourceName: connector.dataSourceName,
          workspaceAPIKey: connector.workspaceAPIKey,
        },
        connector.nangoConnectionId
      );
      return;
    }
    default:
      throw new Error(`Unknown workspace command: ${command}`);
  }
};

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 2) {
    throw new Error(
      "Expects object type and command as first two arguments, eg: `cli connectors stop ...`"
    );
  }

  const [objectType, command] = argv._;

  if (!command) {
    throw new Error(
      "Expects object type and command as first two arguments, eg: `cli connectors stop ...`"
    );
  }

  switch (objectType) {
    case "connectors":
      await connectors(command, argv);
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
