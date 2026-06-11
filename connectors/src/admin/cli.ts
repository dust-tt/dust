import { program } from "@connectors/admin/program";

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
});
