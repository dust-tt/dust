import { EnvironmentConfig } from "@dust-tt/types";

const config = {
  getAuth0TenantUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("AUTH0_TENANT_DOMAIN_URL");
  },
  getAuth0M2MClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("AUTH0_M2M_CLIENT_ID");
  },
  getAuth0M2MClientSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("AUTH0_M2M_CLIENT_SECRET");
  },
  getAuth0WebApplicationId: (): string => {
    return EnvironmentConfig.getEnvVariable("AUTH0_WEB_APP_CLIENT_ID");
  },
};

export default config;
