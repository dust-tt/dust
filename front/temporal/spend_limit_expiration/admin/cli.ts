import logger from "@app/logger/logger";
import { createOrUpdateSpendLimitExpirationSchedule } from "@app/temporal/spend_limit_expiration/client";
import parseArgs from "minimist";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  logger.info(`Running command: ${command}`);

  switch (command) {
    case "start":
      await createOrUpdateSpendLimitExpirationSchedule();
      return;
    default:
      logger.info("Unknown command, possible values: `start`");
      return;
  }
};

main()
  .then(() => {
    logger.info("Done");
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, `Error: ${err.message}`);
    process.exit(1);
  });
