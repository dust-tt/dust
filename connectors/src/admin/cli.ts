import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import parseArgs from "minimist";

import { runCommand } from "@connectors/lib/cli";
import type { AdminCommandType } from "@connectors/types";
import { AdminCommandSchema } from "@connectors/types";

const main = async () => {
  // set env var INTERACTIVE=1 to enable interactive mode
  process.env.INTERACTIVE_CLI = process.env.INTERACTIVE_CLI || "1";

  const argv = parseArgs(process.argv.slice(2), {
    string: "wId",
  });

  if (argv._.length < 2) {
    throw new Error(
      "Expects object type and command as first two arguments, eg: `cli connectors stop ...`"
    );
  }

  const [objectType, command] = argv._;
  const args = { ...argv, _: undefined, "--": undefined };

  const adminCommandValidation = AdminCommandSchema.decode({
    majorCommand: objectType,
    command,
    args,
  });

  if (isLeft(adminCommandValidation)) {
    const pathError = reporter.formatValidationErrors(
      adminCommandValidation.left
    );
    throw new Error(`Invalid command: ${pathError}`);
  }
  const adminCommand: AdminCommandType = adminCommandValidation.right;
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
