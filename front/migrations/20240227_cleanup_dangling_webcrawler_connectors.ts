import { ConnectorsAPI } from "@dust-tt/types";
import { QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import { getConnectorReplicaDbConnection } from "@app/lib/production_checks/utils";
import { DataSource } from "@app/lib/resources/storage/models/data_source";
import logger from "@app/logger/logger";

async function main() {
  const { LIVE } = process.env;
  const connectorsReplica = getConnectorReplicaDbConnection();
  const connectors: { id: number }[] = await connectorsReplica.query(
    "SELECT id FROM connectors WHERE type = 'webcrawler' ORDER BY id ASC",
    {
      type: QueryTypes.SELECT,
    }
  );
  console.log("Will check this number of connectors:", connectors.length);
  for (const connector of connectors) {
    const dataSource = await DataSource.findOne({
      where: {
        connectorId: connector.id.toString(),
        connectorProvider: "webcrawler",
      },
    });
    if (!dataSource) {
      console.log(
        "No data source found for connector, should delete connector",
        connector
      );
      if (LIVE) {
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        const deleteRes = await connectorsAPI.deleteConnector(
          connector.id.toString()
        );
        if (deleteRes.isErr()) {
          throw deleteRes.error;
        } else {
          console.log("Deleted connector", connector);
        }
      }
    }
  }
}

main().catch(console.error);
