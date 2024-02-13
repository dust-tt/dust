import { EnvironmentConfig } from "@dust-tt/types";
export const dbConfig = {
  getRequiredDatabaseURI: (): string => {
    return EnvironmentConfig.getEnvVariable("CONNECTORS_DATABASE_URI");
  },
};
