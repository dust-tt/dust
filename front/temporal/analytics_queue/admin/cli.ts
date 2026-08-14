import logger from "@app/logger/logger";
import { createOrUpdateConsumptionExportCleanupSchedule } from "@app/temporal/analytics_queue/client";
import parseArgs from "minimist";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  logger.info({ command }, "Running command");

  switch (command) {
    case "start-consumption-export-cleanup":
      await createOrUpdateConsumptionExportCleanupSchedule();
      return;
    default:
      logger.warn(
        "Unknown command, possible values: `start-consumption-export-cleanup`"
      );
      return;
  }
};

main()
  .then(() => {
    logger.info("Done");
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, "Error details");
    process.exit(1);
  });
