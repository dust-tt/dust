import { EnvironmentConfig } from "@dust-tt/types";

export const googleDriveConfig = {
  getRequiredGoogleDriveClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("GOOGLE_CLIENT_ID");
  },
  getRequiredGoogleDriveClientSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("GOOGLE_CLIENT_SECRET");
  },
};
