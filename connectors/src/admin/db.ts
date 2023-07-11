import {
  Connector,
  GithubConnectorState,
  GithubDiscussion,
  GithubIssue,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  GoogleDriveWebhook,
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
  SlackChatBotMessages,
  SlackConfiguration,
  SlackMessages,
} from "@connectors/lib/models";
import logger from "@connectors/logger/logger";

async function main(): Promise<void> {
  await Connector.sync({ alter: true });
  await SlackConfiguration.sync({ alter: true });
  await SlackMessages.sync({ alter: true });
  await SlackChatBotMessages.sync({ alter: true });
  await NotionPage.sync({ alter: true });
  await NotionDatabase.sync({ alter: true });
  await NotionConnectorState.sync({ alter: true });
  await GithubConnectorState.sync({ alter: true });
  await GithubIssue.sync({ alter: true });
  await GithubDiscussion.sync({ alter: true });
  await GoogleDriveFolders.sync({ alter: true });
  await GoogleDriveFiles.sync({ alter: true });
  await GoogleDriveSyncToken.sync({ alter: true });
  await GoogleDriveWebhook.sync({ alter: true });
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
