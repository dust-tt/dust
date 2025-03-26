import { EnvironmentConfig } from "@app/types";

const config = {
  getGcsRelocationBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_RELOCATION_BUCKET");
  },
  getGcsSourceProjectId: (): string => {
    return EnvironmentConfig.getEnvVariable("GCP_PROJECT_ID");
  },
};

export default config;
