import { EnvironmentConfig } from "@dust-tt/types";

const config = {
  getServiceAccount: (): string => {
    return EnvironmentConfig.getEnvVariable("SERVICE_ACCOUNT");
  },
  getPublicUploadBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_UPLOAD_BUCKET");
  },
};

export default config;
