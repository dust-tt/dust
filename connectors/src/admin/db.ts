import { Sequelize } from "sequelize";

import {
  Connector,
  GithubConnectorState,
  GithubDiscussion,
  GithubIssue,
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSyncToken,
  GoogleDriveWebhook,
  NotionConnectorBlockCacheEntry,
  NotionConnectorPageCacheEntry,
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
  sequelize_conn,
  SlackChannel,
  SlackChatBotMessage,
  SlackConfiguration,
  SlackMessages,
} from "@connectors/lib/models";
import logger from "@connectors/logger/logger";

async function main(): Promise<void> {
  await Connector.sync({ alter: true });
  await SlackConfiguration.sync({ alter: true });
  await SlackMessages.sync({ alter: true });
  await SlackChannel.sync({ alter: true });
  await SlackChatBotMessage.sync({ alter: true });
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
  await NotionConnectorBlockCacheEntry.sync({ alter: true });
  await NotionConnectorPageCacheEntry.sync({ alter: true });

  // enable the `unaccent` extension
  await sequelize_conn.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

  await addSearchVectorTrigger(
    sequelize_conn,
    "notion_pages",
    "notion_pages_vector_update",
    "notion_pages_trigger"
  );
  await addSearchVectorTrigger(
    sequelize_conn,
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
  sequelize_conn: Sequelize,
  tableName: string,
  triggerName: string,
  functionName: string
) {
  // this creates/updates a function that will be called on every insert/update
  await sequelize_conn.query(`
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
  await sequelize_conn.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = '${triggerName}') THEN
          CREATE TRIGGER ${triggerName}
          BEFORE INSERT OR UPDATE ON "${tableName}"
          FOR EACH ROW EXECUTE FUNCTION ${functionName}();
        END IF;
      END $$;
    `);
}
