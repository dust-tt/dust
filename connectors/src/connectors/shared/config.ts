import { EnvironmentConfig } from "@connectors/types";

export const SUPPORTED_REGIONS = ["europe-west1", "us-central1"] as const;
export type RegionType = (typeof SUPPORTED_REGIONS)[number];

export const SUPPORTED_CELLS = ["cell-00000", "cell-00001"] as const;
export type CellType = (typeof SUPPORTED_CELLS)[number];
export const CELL_TO_REGION: Record<CellType, RegionType> = {
  "cell-00000": "us-central1",
  "cell-00001": "europe-west1",
};

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
  getCurrentCell: (): CellType => {
    return EnvironmentConfig.getEnvVariable("CELL") as CellType;
  },
};
