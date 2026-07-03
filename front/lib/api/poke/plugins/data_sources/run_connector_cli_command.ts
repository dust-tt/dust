import config from "@app/lib/api/config";
import { GENERIC_CONNECTOR_GROUP } from "@app/lib/api/poke/plugins/data_sources/connector_cli_commands";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const runConnectorCliCommandPlugin = createPlugin({
  manifest: {
    id: "run-connector-cli-command",
    name: "Connector CLI Command",
    description:
      "Run an admin CLI command for this connector. The command group and " +
      "the workspace/data source/connector are implied; just pick a command " +
      "and fill in the remaining parameters.",
    warning:
      "This runs raw connectors admin commands, including destructive ones. " +
      "Double-check the command and parameters before running.",
    resourceTypes: ["data_sources"],
    args: {
      majorCommand: { type: "string", label: "Command group" },
      command: { type: "string", label: "Subcommand" },
      argsJson: { type: "text", label: "Arguments (JSON)" },
    },
    requiredRoles: ["engineering"],
  },
  // Only applicable to connector-backed data sources (folders have no
  // connector and no CLI commands).
  isApplicableTo: (_auth, resource) => resource?.connectorProvider != null,
  execute: async (auth, dataSource, args) => {
    const { majorCommand, command, argsJson } = args;

    if (
      !dataSource ||
      !dataSource.connectorProvider ||
      !dataSource.connectorId
    ) {
      return new Err(
        new Error("This plugin requires a connector-backed data source.")
      );
    }

    // Defense in depth: the form only offers the provider's own group and the
    // generic lifecycle group, so reject anything else even though connectors
    // re-validates the command.
    if (
      majorCommand !== GENERIC_CONNECTOR_GROUP &&
      majorCommand !== dataSource.connectorProvider
    ) {
      return new Err(
        new Error(
          `Command group "${majorCommand}" is not valid for a ` +
            `${dataSource.connectorProvider} connector.`
        )
      );
    }

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = argsJson ? JSON.parse(argsJson) : {};
    } catch (err) {
      return new Err(
        new Error(`Invalid arguments JSON: ${normalizeError(err).message}`)
      );
    }

    // Inject the implied context. `connectorId` is a ModelId and is resolved
    // here (server-side) rather than sent by the client (SEC2). Connectors
    // strips any of these that a given command's schema does not declare.
    const workspace = auth.getNonNullableWorkspace();
    const commandArgs = {
      ...parsedArgs,
      wId: workspace.sId,
      dsId: dataSource.sId,
      connectorId: Number(dataSource.connectorId),
    };

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const result = await connectorsAPI.adminRun({
      majorCommand,
      command,
      args: commandArgs,
    });

    if (result.isErr()) {
      return new Err(new Error(`Connectors error: ${result.error.message}`));
    }

    return new Ok({ display: "json", value: { result: result.value } });
  },
});
