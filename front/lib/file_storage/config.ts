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
  getLLMTracesBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_LLM_TRACES_BUCKET");
  },
  getDustTablesBucket: (): string => {
    // TODO: we need to make sure this is set on front-reloc deployments
    return EnvironmentConfig.getEnvVariable("DUST_TABLES_BUCKET");
  },
};

export default config;
