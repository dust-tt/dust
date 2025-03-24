import { EnvironmentConfig } from "@app/types";

export const dbConfig = {
  getRequiredFrontDatabaseURI: (): string => {
    return EnvironmentConfig.getEnvVariable("FRONT_DATABASE_URI");
  },
  getRequiredFrontReplicaDatabaseURI: (): string => {
    return EnvironmentConfig.getEnvVariable("FRONT_DATABASE_READ_REPLICA_URI");
  },
};
