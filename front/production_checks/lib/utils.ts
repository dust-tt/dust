import { Sequelize } from "sequelize";

import config from "@app/production_checks/lib/config";

// Variables to hold the singleton instances.
let connectorReplicaDbInstance: Sequelize | null = null;
let frontReplicaDbInstance: Sequelize | null = null;

export function getConnectorReplicaDbConnection() {
  if (!connectorReplicaDbInstance) {
    connectorReplicaDbInstance = new Sequelize(
      config.getConnectorsDatabaseReadReplicaUri() as string,
      {
        logging: false,
      }
    );
  }

  return connectorReplicaDbInstance;
}

export function getCoreReplicaDbConnection() {
  if (!connectorReplicaDbInstance) {
    connectorReplicaDbInstance = new Sequelize(
      config.getCoreDatabaseReadReplicaUri() as string,
      {
        logging: false,
      }
    );
  }

  return connectorReplicaDbInstance;
}

export function getFrontReplicaDbConnection() {
  if (!frontReplicaDbInstance) {
    frontReplicaDbInstance = new Sequelize(
      config.getFrontDatabaseReadReplicaUri() as string,
      {
        logging: false,
      }
    );
  }

  return frontReplicaDbInstance;
}
