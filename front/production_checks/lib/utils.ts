import { Sequelize } from "sequelize";

import config from "@app/production_checks/lib/config";

export function getConnectorReplicaDbConnection() {
  return new Sequelize(config.getConnectorsDatabaseReadReplicaUri() as string, {
    logging: false,
  });
}

export function getFrontReplicaDbConnection() {
  return new Sequelize(config.getFrontDatabaseReadReplicaUri() as string, {
    logging: false,
  });
}
