import { EnvironmentConfig } from "@connectors/connectors/config";

export const dbConfig = {
  getRequiredDatabaseURI: (): string => {
    return EnvironmentConfig.getEnvVariable("CONNECTORS_DATABASE_URI");
  },
};
