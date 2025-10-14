import { EnvironmentConfig } from "@app/types";

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
  getGcsUpsertQueueBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_UPSERT_QUEUE_BUCKET");
  },
  getDustDataSourcesBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_DATA_SOURCES_BUCKET");
  },
  getWebhookRequestsBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_WEBHOOK_REQUESTS_BUCKET");
  },
};

export default config;
