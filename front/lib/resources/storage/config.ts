import { EnvironmentConfig } from "@dust-tt/types";

export const dbConfig = {
  getRequiredFrontDatabaseURI: (): string => {
    return EnvironmentConfig.getEnvVariable("FRONT_DATABASE_URI");
  },
};
