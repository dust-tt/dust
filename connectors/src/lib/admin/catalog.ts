import type { Command } from "@commander-js/extra-typings";
import type { CliCommandCatalog, CliCommandOption } from "@connectors/types";
import { AdminCommandSchema } from "@connectors/types";

export function buildCliCommandCatalog(program: Command): CliCommandCatalog {
  // Param metadata from Commander (public option API). Keyed by group name.
  const descriptionByGroup = new Map<string, string>();
  const optionsByGroup = new Map<string, CliCommandOption[]>();

  for (const cmd of program.commands) {
    descriptionByGroup.set(cmd.name(), cmd.description());
    // Commander doesn't publicly type a `cmd.options` accessor, so we go
    // through the public `Help` API instead. This also surfaces an implicit
    // `--help` option that every command auto-registers, which we exclude.
    const options = cmd
      .createHelp()
      .visibleOptions(cmd)
      .filter((opt) => opt.long !== "--help")
      .map((opt) => ({
        // Every admin option declares a long flag (e.g. "--connectorId").
        name: (opt.long ?? "").replace(/^--/, ""),
        description: opt.description,
        // Options declared with `parseInt` as their coercion are numeric.
        isNumber: opt.parseArg === parseInt,
        // Options declared with a `<bool>` value placeholder are booleans
        // (submitted as the string "true").
        isBoolean: /<bool>|\[bool\]/i.test(opt.flags ?? ""),
      }));
    optionsByGroup.set(cmd.name(), options);
  }

  // Structure from the authoritative zod discriminated union. Each member's
  // `command` field is a union of literals (every group has >= 2 subcommands).
  const groups = AdminCommandSchema.options.map((member) => {
    const majorCommand = member.shape.majorCommand.value;
    const subcommands = member.shape.command.options.map((lit) => lit.value);

    return {
      majorCommand,
      description: descriptionByGroup.get(majorCommand) ?? "",
      subcommands,
      options: optionsByGroup.get(majorCommand) ?? [],
    };
  });

  return { groups };
}
