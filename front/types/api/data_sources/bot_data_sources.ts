import type { DataSourceType } from "@app/types/data_source";

export type GetBotDataSourcesResponseBody = {
  slackBotDataSource: DataSourceType | null;
  microsoftBotDataSource: DataSourceType | null;
  discordBotDataSource: DataSourceType | null;
};
