import {
  Connector,
  NotionConnectorState,
  NotionPage,
  SlackConfiguration,
} from "@connectors/lib/models";
import logger from "@connectors/logger/logger";

async function main(): Promise<void> {
  await Connector.sync({ alter: true });
  await SlackConfiguration.sync({ alter: true });
  await NotionPage.sync({ alter: true });
  await NotionConnectorState.sync({ alter: true });
  return;
}

main()
  .then(() => {
    logger.info("Done");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(
      {
        error: err,
      },
      "Failed to sync database schema"
    );
    process.exit(1);
  });
