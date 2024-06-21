import { EnvironmentConfig } from "@dust-tt/types";

export const googleDriveConfig = {
  getRequiredNangoGoogleDriveConnectorId: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_GOOGLE_DRIVE_CONNECTOR_ID");
  },
  getRequiredGoogleDriveClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("GOOGLE_CLIENT_ID");
  },
  getRequiredGoogleDriveClientSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("GOOGLE_CLIENT_SECRET");
  },
};
