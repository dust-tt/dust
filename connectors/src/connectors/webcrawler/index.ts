import { Connector, sequelize_conn } from "@connectors/lib/models";
import { WebCrawlerConfiguration } from "@connectors/lib/models/webcrawler";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

export async function createWebcrawlerConnector(
  dataSourceConfig: DataSourceConfig
): Promise<Result<string, Error>> {
  const res = await sequelize_conn.transaction(
    async (t): Promise<Result<Connector, Error>> => {
      const connector = await Connector.create(
        {
          type: "webcrawler",
          connectionId: null,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction: t }
      );

      return new Ok(connector);
    }
  );

  if (res.isErr()) {
    return res;
  }

  return new Ok(res.value.id.toString());
}
