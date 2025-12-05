import { EnvironmentConfig } from "@connectors/types";

const SUPPORTED_REGIONS = ["europe-west1", "us-central1"] as const;
type RegionType = (typeof SUPPORTED_REGIONS)[number];

export const connectorsConfig = {
  getDustTmpSyncBucketName: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_TMP_SYNC_BUCKET_NAME");
  },
  getServiceAccount: (): string => {
    return EnvironmentConfig.getEnvVariable("SERVICE_ACCOUNT");
  },
  getWebhookRouterConfigBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("GCP_WEBHOOK_ROUTER_CONFIG_BUCKET");
  },
  getCurrentRegion: (): RegionType => {
    return EnvironmentConfig.getEnvVariable("REGION") as RegionType;
  },
};
