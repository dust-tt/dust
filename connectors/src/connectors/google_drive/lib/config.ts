import { EnvironmentConfig } from "@dust-tt/types";

export const GOOGLE_DRIVE_WEBHOOK_RENEW_MARGIN_MS = 60 * 60 * 1000;
export const GOOGLE_DRIVE_WEBHOOK_LIFE_MS = 60 * 60 * 7 * 1000;

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
