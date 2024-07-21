import { sendInitDbMessage } from "@dust-tt/types";
import type { Sequelize } from "sequelize";

import {
  ConfluenceConfiguration,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import {
  GithubCodeDirectory,
  GithubCodeFile,
  GithubCodeRepository,
  GithubConnectorState,
  GithubDiscussion,
  GithubIssue,
} from "@connectors/lib/models/github";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSheet,
  GoogleDriveSyncToken,
} from "@connectors/lib/models/google_drive";
import {
  IntercomArticle,
  IntercomCollection,
  IntercomConversation,
  IntercomHelpCenter,
  IntercomTeam,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import {
  MicrosoftConfigurationModel,
  MicrosoftNodeModel,
  MicrosoftRootModel,
} from "@connectors/lib/models/microsoft";
import {
  NotionConnectorBlockCacheEntry,
  NotionConnectorPageCacheEntry,
  NotionConnectorResourcesToCheckCacheEntry,
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models/notion";
import {
  SlackBotWhitelistModel,
  SlackChannel,
  SlackChatBotMessage,
  SlackConfigurationModel,
  SlackMessages,
} from "@connectors/lib/models/slack";
import {
  WebCrawlerConfigurationHeader,
  WebCrawlerConfigurationModel,
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import logger from "@connectors/logger/logger";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

async function main(): Promise<void> {
  await sendInitDbMessage({
    service: "connectors",
    logger: logger,
  });
  await ConnectorModel.sync({ alter: true });
  await ConfluenceConfiguration.sync({ alter: true });
  await ConfluencePage.sync({ alter: true });
  await ConfluenceSpace.sync({ alter: true });
  await SlackConfigurationModel.sync({ alter: true });
  await SlackMessages.sync({ alter: true });
  await SlackChannel.sync({ alter: true });
  await SlackChatBotMessage.sync({ alter: true });
  await SlackBotWhitelistModel.sync({ alter: true });
  await NotionPage.sync({ alter: true });
  await NotionDatabase.sync({ alter: true });
  await NotionConnectorState.sync({ alter: true });
  await GithubConnectorState.sync({ alter: true });
  await GithubIssue.sync({ alter: true });
  await GithubDiscussion.sync({ alter: true });
  await GithubCodeRepository.sync({ alter: true });
  await GithubCodeFile.sync({ alter: true });
  await GithubCodeDirectory.sync({ alter: true });
  await GoogleDriveFolders.sync({ alter: true });
  await GoogleDriveFiles.sync({ alter: true });
  await GoogleDriveSheet.sync({ alter: true });
  await GoogleDriveSyncToken.sync({ alter: true });
  await MicrosoftConfigurationModel.sync({ alter: true });
  await MicrosoftRootModel.sync({ alter: true });
  await MicrosoftNodeModel.sync({ alter: true });
  await NotionConnectorBlockCacheEntry.sync({ alter: true });
  await NotionConnectorPageCacheEntry.sync({ alter: true });
  await NotionConnectorResourcesToCheckCacheEntry.sync({ alter: true });
  await GoogleDriveConfig.sync({ alter: true });
  await IntercomWorkspace.sync({ alter: true });
  await IntercomHelpCenter.sync({ alter: true });
  await IntercomCollection.sync({ alter: true });
  await IntercomArticle.sync({ alter: true });
  await IntercomTeam.sync({ alter: true });
  await IntercomConversation.sync({ alter: true });
  await WebCrawlerConfigurationModel.sync({ alter: true });
  await WebCrawlerFolder.sync({ alter: true });
  await WebCrawlerPage.sync({ alter: true });
  await WebCrawlerConfigurationHeader.sync({ alter: true });

  // enable the `unaccent` extension
  await sequelizeConnection.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

  await addSearchVectorTrigger(
    sequelizeConnection,
    "notion_pages",
    "notion_pages_vector_update",
    "notion_pages_trigger"
  );
  await addSearchVectorTrigger(
    sequelizeConnection,
    "notion_databases",
    "notion_databases_vector_update",
    "notion_databases_trigger"
  );
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

async function addSearchVectorTrigger(
  sequelizeConnection: Sequelize,
  tableName: string,
  triggerName: string,
  functionName: string
) {
  // this creates/updates a function that will be called on every insert/update
  await sequelizeConnection.query(`
      CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger AS $$
      begin
        if TG_OP = 'INSERT' OR new.title IS DISTINCT FROM old.title then
          new."titleSearchVector" := to_tsvector('english', unaccent(coalesce(new.title, '')));
        end if;
        return new;
      end
      $$ LANGUAGE plpgsql;
    `);

  // this creates/updates a trigger that will call the function above
  await sequelizeConnection.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${triggerName}') THEN
          CREATE TRIGGER ${triggerName}
          BEFORE INSERT OR UPDATE ON "${tableName}"
          FOR EACH ROW EXECUTE FUNCTION ${functionName}();
        END IF;
      END $$;
    `);
}
