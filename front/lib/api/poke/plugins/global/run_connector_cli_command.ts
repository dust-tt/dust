import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const runConnectorCliCommandPlugin = createPlugin({
  manifest: {
    id: "run-connector-cli-command",
    name: "Run Connector CLI Command",
    description:
      "Run any connectors admin CLI command. Select a group and subcommand, " +
      "then fill in the parameters.",
    warning:
      "This runs raw connectors admin commands, including destructive ones. " +
      "Double-check the group, subcommand and parameters before running.",
    resourceTypes: ["global"],
    args: {
      majorCommand: { type: "string", label: "Command group" },
      command: { type: "string", label: "Subcommand" },
      argsJson: { type: "text", label: "Arguments (JSON)" },
    },
    requiredRoles: ["engineering"],
  },
  execute: async (_auth, _resource, args) => {
    const { majorCommand, command, argsJson } = args;

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = argsJson ? JSON.parse(argsJson) : {};
    } catch (err) {
      return new Err(
        new Error(`Invalid arguments JSON: ${normalizeError(err).message}`)
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const result = await connectorsAPI.adminRun({
      majorCommand,
      command,
      args: parsedArgs,
    });

    if (result.isErr()) {
      return new Err(new Error(`Connectors error: ${result.error.message}`));
    }

    return new Ok({ display: "json", value: { result: result.value } });
  },
});
