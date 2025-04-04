import { EnvironmentConfig } from "@app/types";

const config = {
  getUpsertQueueBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_UPSERT_QUEUE_BUCKET");
  },
  getServiceAccount: (): string => {
    return EnvironmentConfig.getEnvVariable("SERVICE_ACCOUNT");
  },
};

export default config;
