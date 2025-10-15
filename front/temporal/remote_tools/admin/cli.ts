import parseArgs from "minimist";

import { createRemoteMCPServersSyncSchedule } from "@app/temporal/remote_tools/client";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  console.log(`Running command: ${command}`);

  switch (command) {
    case "start":
      await createRemoteMCPServersSyncSchedule();
      return;
    default:
      console.log("Unknown command, possible values: `start`");
      return;
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
