import type {
  CliCommandCatalog,
  CliCommandGroup,
} from "@app/types/connectors/admin/catalog";

// The generic lifecycle group (pause/resume/full-resync/...) applies to any
// connector regardless of provider, so it is always offered alongside the
// provider-specific group.
export const GENERIC_CONNECTOR_GROUP = "connectors";

// Context params derived server-side from the data source (workspace, data
// source, connector). They are never shown in the form and never sent by the
// client — `connectorId` is a ModelId (SEC2).
export const IMPLIED_CONTEXT_PARAMS = ["wId", "dsId", "connectorId"];

// Separator used to encode "<majorCommand>::<command>" in a single dropdown
// value. Neither group nor command names contain "::".
const COMMAND_VALUE_SEPARATOR = "::";

// The command groups relevant to a connector of the given provider: the group
// whose name matches the provider (if the CLI has one) plus the generic group.
export function relevantGroupsForProvider(
  catalog: CliCommandCatalog,
  connectorProvider: string
): CliCommandGroup[] {
  return catalog.groups.filter(
    (g) =>
      g.majorCommand === connectorProvider ||
      g.majorCommand === GENERIC_CONNECTOR_GROUP
  );
}

// Flattens the relevant groups' subcommands into a single command dropdown.
// The value encodes both the group and the subcommand; the label is suffixed
// with the group name only when more than one group is relevant (so the user
// can tell a provider command from a generic lifecycle command).
export function buildConnectorCommandOptions(
  catalog: CliCommandCatalog,
  connectorProvider: string
): { label: string; value: string }[] {
  const groups = relevantGroupsForProvider(catalog, connectorProvider);
  const showGroupSuffix = groups.length > 1;

  return groups.flatMap((group) =>
    group.subcommands.map((command) => ({
      label: showGroupSuffix ? `${command} (${group.majorCommand})` : command,
      value: `${group.majorCommand}${COMMAND_VALUE_SEPARATOR}${command}`,
    }))
  );
}

// Splits a command dropdown value back into its group and subcommand.
export function parseConnectorCommandValue(value: string): {
  majorCommand: string;
  command: string;
} | null {
  const separatorIndex = value.indexOf(COMMAND_VALUE_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }

  return {
    majorCommand: value.slice(0, separatorIndex),
    command: value.slice(separatorIndex + COMMAND_VALUE_SEPARATOR.length),
  };
}
