import { EnvironmentConfig } from "@connectors/types";

export const SUPPORTED_CELLS = [
  "cell-00000",
  "cell-00001",
  "cell-00002",
] as const;
export type CellType = (typeof SUPPORTED_CELLS)[number];

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
  getCurrentCell: (): CellType => {
    return EnvironmentConfig.getEnvVariable("CELL") as CellType;
  },
};
