import { runCommand } from "@connectors/lib/cli";
import type { AdminCommandType } from "@connectors/types";
import { AdminCommandSchema } from "@connectors/types";
import parseArgs from "minimist";
import type { z } from "zod";
import { fromError } from "zod-validation-error";

const main = async () => {
  // set env var INTERACTIVE=1 to enable interactive mode
  process.env.INTERACTIVE_CLI = process.env.INTERACTIVE_CLI || "1";

  const argv = parseArgs(process.argv.slice(2), {
    // Force string parsing for args that may exceed Number.MAX_SAFE_INTEGER.
    // This is the case for Gong call IDs.
    string: ["wId", "callId"],
  });

  if (argv._.length < 2) {
    console.error("Usage: cli <majorCommand> <command> [--arg=value ...]");
    console.error("");
    console.error("Available commands:");
    console.error("");
    for (const schema of AdminCommandSchema.options) {
      const majorCommand = schema.shape.majorCommand.value;
      // schema.shape.command is always a ZodUnion of literal strings in these schemas.
      const commandUnion = schema.shape.command as z.ZodUnion<
        [z.ZodLiteral<string>, ...z.ZodLiteral<string>[]]
      >;
      const subCommands = commandUnion.options.map((c) => c.value);
      console.error(`  ${majorCommand}:`);
      console.error(`    ${subCommands.join(", ")}`);
    }
    process.exit(0);
  }

  const [objectType, command] = argv._;
  const args = { ...argv, _: undefined, "--": undefined };

  const adminCommandValidation = AdminCommandSchema.safeParse({
    majorCommand: objectType,
    command,
    args,
  });

  if (!adminCommandValidation.success) {
    throw new Error(
      `Invalid command: ${fromError(adminCommandValidation.error).toString()}`
    );
  }
  const adminCommand: AdminCommandType = adminCommandValidation.data;
  return runCommand(adminCommand);
};

main()
  .then((res) => {
    console.log(JSON.stringify(res, null, 2));
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });
