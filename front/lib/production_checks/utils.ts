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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!corePrimaryDbInstance) {
    corePrimaryDbInstance = new Sequelize(config.getCoreDatabasePrimaryUri(), {
      logging: false,
    });
  }

  return corePrimaryDbInstance;
}

export function getFrontPrimaryDbConnection() {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!frontPrimaryDbInstance) {
    frontPrimaryDbInstance = new Sequelize(
      config.getFrontDatabasePrimaryUri(),
      {
        logging: false,
      }
    );
  }

  return frontPrimaryDbInstance;
}
