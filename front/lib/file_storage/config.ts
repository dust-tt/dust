import { EnvironmentConfig } from "@app/types/shared/utils/config";

const config = {
  // Key file path. Unset means Application Default Credentials, Workload Identity on GKE.
  getServiceAccount: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("SERVICE_ACCOUNT");
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
  getGcsTmpWorkloadsBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_TMP_WORKLOADS_BUCKET");
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
  getPokeUserConfigBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_POKE_USER_CONFIG_BUCKET");
  },
  getDustTablesBucket: (): string => {
    // TODO: we need to make sure this is set on front-reloc deployments
    return EnvironmentConfig.getEnvVariable("DUST_TABLES_BUCKET");
  },
};

export default config;
