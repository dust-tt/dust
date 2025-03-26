import { EnvironmentConfig } from "@connectors/types";
export const dbConfig = {
  getRequiredDatabaseURI: (): string => {
    return EnvironmentConfig.getEnvVariable("CONNECTORS_DATABASE_URI");
  },
};
