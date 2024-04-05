import { EnvironmentConfig } from "@dust-tt/types";

export const dbConfig = {
  getRequiredFrontDatabaseURI: (): string => {
    return EnvironmentConfig.getEnvVariable("FRONT_DATABASE_URI");
  },
  getRequiredFrontReplicaDatabaseURI: (): string => {
    return EnvironmentConfig.getEnvVariable("FRONT_DATABASE_READ_REPLICA_URI");
  },
};

export const gcsConfig = {
  getGcsPrivateUploadsBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_PRIVATE_UPLOADS_BUCKET");
  },
};
