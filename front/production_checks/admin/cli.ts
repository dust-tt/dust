import parseArgs from "minimist";

import { launchProductionChecksWorkflow } from "../temporal/client";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 2) {
    console.log(
      "Expects object type and command as first two arguments, eg: `cli workspace create ...`"
    );
    console.log("Possible object types: `workspace`, `user`, `data-source`");
    return;
  }

  const [command] = argv._;

  switch (command) {
    case "start":
      await launchProductionChecksWorkflow();
      return;
    default:
      console.log("Unknown object type, possible values: `start`");
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
