import { EnvironmentConfig } from "@app/types";

const config = {
  getConnectorsDatabasePrimaryUri: (): string => {
    return EnvironmentConfig.getEnvVariable("CONNECTORS_DATABASE_URI");
  },
  getConnectorsDatabaseReadReplicaUri: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "CONNECTORS_DATABASE_READ_REPLICA_URI"
    );
  },
  getCoreDatabasePrimaryUri: (): string => {
    return EnvironmentConfig.getEnvVariable("CORE_DATABASE_URI");
  },
  getCoreDatabaseReadReplicaUri: (): string => {
    return EnvironmentConfig.getEnvVariable("CORE_DATABASE_READ_REPLICA_URI");
  },
  getFrontDatabasePrimaryUri: (): string => {
    return EnvironmentConfig.getEnvVariable("FRONT_DATABASE_URI");
  },
  getFrontDatabaseReadReplicaUri: (): string => {
    return EnvironmentConfig.getEnvVariable("FRONT_DATABASE_READ_REPLICA_URI");
  },
};

export default config;
