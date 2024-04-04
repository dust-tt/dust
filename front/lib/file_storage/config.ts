import { EnvironmentConfig } from "@dust-tt/types";

const config = {
  getServiceAccount: (): string => {
    return EnvironmentConfig.getEnvVariable("SERVICE_ACCOUNT");
  },
  getGcsPublicUploadBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_UPLOAD_BUCKET");
  },
  getGcsPrivateUploadsBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_PRIVATE_UPLOADS_BUCKET");
  },
};

export default config;
