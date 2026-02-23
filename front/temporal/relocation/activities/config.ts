import { EnvironmentConfig } from "@app/types/shared/utils/config";

const config = {
  getGcsRelocationBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_RELOCATION_BUCKET");
  },
  getGcsSourceProjectId: (): string => {
    return EnvironmentConfig.getEnvVariable("GCP_PROJECT_ID");
  },
};

export default config;
