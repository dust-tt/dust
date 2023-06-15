import {
  Connector,
  GoogleDriveWebhook,
  sequelize_conn,
} from "@connectors/lib/models.js";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

import { registerWebhook } from "./lib";
import { getDriveClient } from "./temporal/activities";
export type NangoConnectionId = string;

const { NANGO_GOOGLE_DRIVE_CONNECTOR_ID } = process.env;

export async function createGoogleDriveConnector(
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  const res = await sequelize_conn.transaction(
    async (t): Promise<Result<Connector, Error>> => {
      if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
        throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not defined");
      }
      const driveClient = await getDriveClient(nangoConnectionId);
      const sanityCheckRes = await driveClient.about.get({ fields: "*" });
      if (sanityCheckRes.status !== 200) {
        return new Err(
          new Error(
            `Could not get google drive info. Error message: ${
              sanityCheckRes.statusText || "unknown"
            }`
          )
        );
      }

      const connector = await Connector.create(
        {
          type: "google_drive",
          connectionId: nangoConnectionId,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction: t }
      );

      const webhookInfo = await registerWebhook(connector.connectionId);
      if (webhookInfo.isErr()) {
        return webhookInfo;
      } else {
        await GoogleDriveWebhook.create(
          {
            webhookId: webhookInfo.value.id,
            expiresAt: new Date(webhookInfo.value.expirationTsMs),
            connectorId: connector.id,
            url: webhookInfo.value.url,
          },
          { transaction: t }
        );
      }

      return new Ok(connector);
    }
  );
  if (res.isErr()) {
    return res;
  }

  return new Ok(res.value.id.toString());
}
