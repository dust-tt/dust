import { EnvironmentConfig } from "@connectors/types";

export const connectorsConfig = {
  getDustTmpSyncBucketName: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_TMP_SYNC_BUCKET_NAME");
  },
  getServiceAccount: (): string => {
    return EnvironmentConfig.getEnvVariable("SERVICE_ACCOUNT");
  },
};
