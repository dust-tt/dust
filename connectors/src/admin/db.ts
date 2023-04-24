import { Connector, SlackConfiguration } from "../lib/models.js";
import logger from "../logger/logger";

async function main(): Promise<void> {
  await Connector.sync({ alter: true });
  await SlackConfiguration.sync({ alter: true });
  return;
}

main()
  .then(() => {
    logger.info("Done");
  })
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
