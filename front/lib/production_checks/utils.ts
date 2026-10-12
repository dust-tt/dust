import config from "@app/lib/production_checks/config";
import { Sequelize } from "sequelize";

// Connectors in the h1-pentest workspace, which is a test we don't want to alert on.
export const IGNORED_CONNECTOR_IDS = [55901, 55902];

// Variables to hold the singleton instances.
let connectorsReplicaDbInstance: Sequelize | null = null;
let connectorsPrimaryDbInstance: Sequelize | null = null;
let coreReplicaDbInstance: Sequelize | null = null;
let corePrimaryDbInstance: Sequelize | null = null;
let frontReplicaDbInstance: Sequelize | null = null;

export function getConnectorsReplicaDbConnection() {
  if (!connectorsReplicaDbInstance) {
    connectorsReplicaDbInstance = new Sequelize(
      config.getConnectorsDatabaseReadReplicaUri(),
      {
        logging: false,
      }
    );
  }

  return connectorsReplicaDbInstance;
}

export function getCoreReplicaDbConnection() {
  if (!coreReplicaDbInstance) {
    coreReplicaDbInstance = new Sequelize(
      config.getCoreDatabaseReadReplicaUri(),
      {
        logging: false,
      }
    );
  }

  return coreReplicaDbInstance;
}

export function getFrontReplicaDbConnection() {
  if (!frontReplicaDbInstance) {
    frontReplicaDbInstance = new Sequelize(
      config.getFrontDatabaseReadReplicaUri(),
      {
        logging: false,
      }
    );
  }

  return frontReplicaDbInstance;
}

export function getConnectorsPrimaryDbConnection() {
  if (!connectorsPrimaryDbInstance) {
    connectorsPrimaryDbInstance = new Sequelize(
      config.getConnectorsDatabasePrimaryUri(),
      {
        logging: false,
      }
    );
  }

  return connectorsPrimaryDbInstance;
}

export function getCorePrimaryDbConnection() {
  if (!corePrimaryDbInstance) {
    corePrimaryDbInstance = new Sequelize(config.getCoreDatabasePrimaryUri(), {
      logging: false,
    });
  }

  return corePrimaryDbInstance;
}
