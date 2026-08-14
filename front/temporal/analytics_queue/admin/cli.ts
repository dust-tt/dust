import { createOrUpdateConsumptionExportCleanupSchedule } from "@app/temporal/analytics_queue/client";
import parseArgs from "minimist";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  console.log(`Running command: ${command}`);

  switch (command) {
    case "start-consumption-export-cleanup":
      await createOrUpdateConsumptionExportCleanupSchedule();
      return;
    default:
      console.log(
        "Unknown command, possible values: `start-consumption-export-cleanup`"
      );
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
