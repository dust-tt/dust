import type { LabsConnectorProvider } from "@dust-tt/types";
import { assertNever, EnvironmentConfig } from "@dust-tt/types";

const config = {
  getNangoPublicKey: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_PUBLIC_KEY");
  },
  getNangoSecretKey: (): string => {
    return EnvironmentConfig.getEnvVariable("NANGO_SECRET_KEY");
  },
  getNangoConnectorIdForProvider: (provider: LabsConnectorProvider): string => {
    switch (provider) {
      case "google_drive":
        return EnvironmentConfig.getEnvVariable(
          "NANGO_GOOGLE_DRIVE_CONNECTOR_ID"
        );
      case "gong":
        return EnvironmentConfig.getEnvVariable("NANGO_GONG_CONNECTOR_ID");
      default:
        assertNever(provider);
    }
  },
};

export default config;
