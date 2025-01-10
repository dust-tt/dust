import { Sequelize } from "sequelize";

import config from "@app/lib/production_checks/config";

// Variables to hold the singleton instances.
let connectorsReplicaDbInstance: Sequelize | null = null;
let connectorsPrimaryDbInstance: Sequelize | null = null;
let coreReplicaDbInstance: Sequelize | null = null;
let corePrimaryDbInstance: Sequelize | null = null;
let frontReplicaDbInstance: Sequelize | null = null;
let frontPrimaryDbInstance: Sequelize | null = null;

export function getConnectorsReplicaDbConnection() {
  if (!connectorsReplicaDbInstance) {
    connectorsReplicaDbInstance = new Sequelize(
      config.getConnectorsDatabaseReadReplicaUri() as string,
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
      config.getCoreDatabaseReadReplicaUri() as string,
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
      config.getFrontDatabaseReadReplicaUri() as string,
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
      config.getConnectorsDatabasePrimaryUri() as string,
      {
        logging: false,
      }
    );
  }

  return connectorsPrimaryDbInstance;
}

export function getCorePrimaryDbConnection() {
  if (!corePrimaryDbInstance) {
    corePrimaryDbInstance = new Sequelize(
      config.getCoreDatabasePrimaryUri() as string,
      {
        logging: false,
      }
    );
  }

  return corePrimaryDbInstance;
}

export function getFrontPrimaryDbConnection() {
  if (!frontPrimaryDbInstance) {
    frontPrimaryDbInstance = new Sequelize(
      config.getFrontDatabasePrimaryUri() as string,
      {
        logging: false,
      }
    );
  }

  return frontPrimaryDbInstance;
}
