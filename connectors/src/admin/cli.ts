import { buildAdminProgram } from "@connectors/admin/cli_program";

process.env.INTERACTIVE_CLI = process.env.INTERACTIVE_CLI || "1";

const program = buildAdminProgram();

program.parseAsync(process.argv).catch((err: Error) => {
  // eslint-disable-next-line no-console -- CLI user-facing output.
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
});
