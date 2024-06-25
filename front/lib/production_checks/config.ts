import { EnvironmentConfig } from "@dust-tt/types";

const config = {
  getConnectorsDatabaseReadReplicaUri: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "CONNECTORS_DATABASE_READ_REPLICA_URI"
    );
  },
  getPrimaryCoreDatabaseUri: (): string => {
    return EnvironmentConfig.getEnvVariable("CORE_DATABASE_URI");
  },
  getReadReplicaCoreDatabaseUri: (): string => {
    return EnvironmentConfig.getEnvVariable("CORE_DATABASE_READ_REPLICA_URI");
  },
  getFrontDatabaseReadReplicaUri: (): string => {
    return EnvironmentConfig.getEnvVariable("FRONT_DATABASE_READ_REPLICA_URI");
  },
};

export default config;
