import { EnvironmentConfig } from "@dust-tt/types";

const config = {
  getNangoPublicKey: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_PUBLIC_KEY");
  },
  getNangoSecretKey: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_SECRET_KEY");
  },
  getNangoGoogleDriveConnectorId: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_GOOGLE_DRIVE_CONNECTOR_ID");
  },
};

export default config;
