import { Command } from "@commander-js/extra-typings";
import { buildCliProgram } from "@connectors/admin/cli_registry";
import { allCommands } from "@connectors/admin/commands";

process.env.INTERACTIVE_CLI = process.env.INTERACTIVE_CLI || "1";

const program = new Command();
program.name("cli").description("Admin CLI for connectors");

buildCliProgram(allCommands, program);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
});
