import type { Sequelize } from "sequelize";

import { BigQueryConfigurationModel } from "@connectors/lib/models/bigquery";
import {
  ConfluenceConfigurationModel,
  ConfluenceFolderModel,
  ConfluencePageModel,
  ConfluenceSpaceModel,
} from "@connectors/lib/models/confluence";
import { DiscordConfigurationModel } from "@connectors/lib/models/discord";
import {
  GithubCodeDirectoryModel,
  GithubCodeFileModel,
  GithubCodeRepositoryModel,
  GithubConnectorStateModel,
  GithubDiscussionModel,
  GithubIssueModel,
} from "@connectors/lib/models/github";
import {
  GongConfigurationModel,
  GongTranscriptModel,
  GongUserModel,
} from "@connectors/lib/models/gong";
import {
  GoogleDriveConfigModel,
  GoogleDriveFilesModel,
  GoogleDriveFoldersModel,
  GoogleDriveSheetModel,
  GoogleDriveSyncTokenModel,
} from "@connectors/lib/models/google_drive";
import {
  IntercomArticleModel,
  IntercomCollectionModel,
  IntercomConversationModel,
  IntercomHelpCenterModel,
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import {
  MicrosoftConfigurationModel,
  MicrosoftNodeModel,
  MicrosoftRootModel,
} from "@connectors/lib/models/microsoft";
import {
  MicrosoftBotConfigurationModel,
  MicrosoftBotMessageModel,
} from "@connectors/lib/models/microsoft_bot";
import {
  NotionConnectorBlockCacheEntryModel,
  NotionConnectorPageCacheEntryModel,
  NotionConnectorResourcesToCheckCacheEntryModel,
  NotionConnectorStateModel,
  NotionDatabaseModel,
  NotionPageModel,
} from "@connectors/lib/models/notion";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import {
  SalesforceConfigurationModel,
  SalesforceSyncedQueryModel,
} from "@connectors/lib/models/salesforce";
import {
  SlackBotWhitelistModel,
  SlackChannelModel,
  SlackChatBotMessageModel,
  SlackConfigurationModel,
  SlackMessagesModel,
} from "@connectors/lib/models/slack";
import { SnowflakeConfigurationModel } from "@connectors/lib/models/snowflake";
import {
  WebCrawlerConfigurationHeaderModel,
  WebCrawlerConfigurationModel,
  WebCrawlerFolderModel,
  WebCrawlerPageModel,
} from "@connectors/lib/models/webcrawler";
import {
  ZendeskArticleModel,
  ZendeskBrandModel,
  ZendeskCategoryModel,
  ZendeskConfigurationModel,
  ZendeskTicketModel,
  ZendeskTimestampCursorModel,
} from "@connectors/lib/models/zendesk";
import logger from "@connectors/logger/logger";
import { connectorsSequelize } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { sendInitDbMessage } from "@connectors/types";

async function main(): Promise<void> {
  await sendInitDbMessage({
    service: "connectors",
    logger: logger,
  });
  await ConnectorModel.sync({ alter: true });
  await ConfluenceConfigurationModel.sync({ alter: true });
  await ConfluenceFolderModel.sync({ alter: true });
  await ConfluencePageModel.sync({ alter: true });
  await ConfluenceSpaceModel.sync({ alter: true });
  await DiscordConfigurationModel.sync({ alter: true });
  await SlackConfigurationModel.sync({ alter: true });
  await SlackMessagesModel.sync({ alter: true });
  await SlackChannelModel.sync({ alter: true });
  await SlackChatBotMessageModel.sync({ alter: true });
  await SlackBotWhitelistModel.sync({ alter: true });
  await NotionPageModel.sync({ alter: true });
  await NotionDatabaseModel.sync({ alter: true });
  await NotionConnectorStateModel.sync({ alter: true });
  await GithubConnectorStateModel.sync({ alter: true });
  await GithubIssueModel.sync({ alter: true });
  await GithubDiscussionModel.sync({ alter: true });
  await GithubCodeRepositoryModel.sync({ alter: true });
  await GithubCodeFileModel.sync({ alter: true });
  await GithubCodeDirectoryModel.sync({ alter: true });
  await GoogleDriveFoldersModel.sync({ alter: true });
  await GoogleDriveFilesModel.sync({ alter: true });
  await GoogleDriveSheetModel.sync({ alter: true });
  await GoogleDriveSyncTokenModel.sync({ alter: true });
  await MicrosoftConfigurationModel.sync({ alter: true });
  await MicrosoftRootModel.sync({ alter: true });
  await MicrosoftNodeModel.sync({ alter: true });
  await MicrosoftBotConfigurationModel.sync({ alter: true });
  await MicrosoftBotMessageModel.sync({ alter: true });
  await NotionConnectorBlockCacheEntryModel.sync({ alter: true });
  await NotionConnectorPageCacheEntryModel.sync({ alter: true });
  await NotionConnectorResourcesToCheckCacheEntryModel.sync({ alter: true });
  await GoogleDriveConfigModel.sync({ alter: true });
  await IntercomWorkspaceModel.sync({ alter: true });
  await IntercomHelpCenterModel.sync({ alter: true });
  await IntercomCollectionModel.sync({ alter: true });
  await IntercomArticleModel.sync({ alter: true });
  await IntercomTeamModel.sync({ alter: true });
  await IntercomConversationModel.sync({ alter: true });
  await WebCrawlerConfigurationModel.sync({ alter: true });
  await WebCrawlerFolderModel.sync({ alter: true });
  await WebCrawlerPageModel.sync({ alter: true });
  await WebCrawlerConfigurationHeaderModel.sync({ alter: true });
  await SnowflakeConfigurationModel.sync({ alter: true });
  await BigQueryConfigurationModel.sync({ alter: true });
  await RemoteDatabaseModel.sync({ alter: true });
  await RemoteSchemaModel.sync({ alter: true });
  await RemoteTableModel.sync({ alter: true });
  await ZendeskTimestampCursorModel.sync({ alter: true });
  await ZendeskConfigurationModel.sync({ alter: true });
  await ZendeskBrandModel.sync({ alter: true });
  await ZendeskCategoryModel.sync({ alter: true });
  await ZendeskArticleModel.sync({ alter: true });
  await ZendeskTicketModel.sync({ alter: true });
  await SalesforceConfigurationModel.sync({ alter: true });
  await SalesforceSyncedQueryModel.sync({ alter: true });
  await GongConfigurationModel.sync({ alter: true });
  await GongTranscriptModel.sync({ alter: true });
  await GongUserModel.sync({ alter: true });

  // enable the `unaccent` extension
  await connectorsSequelize.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

  await addSearchVectorTrigger(
    connectorsSequelize,
    "notion_pages",
    "notion_pages_vector_update",
    "notion_pages_trigger"
  );
  await addSearchVectorTrigger(
    connectorsSequelize,
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
