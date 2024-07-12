import { EnvironmentConfig } from "@dust-tt/types";

const config = {
  getAppUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("URL");
  },
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
  getDustInviteTokenSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_INVITE_TOKEN_SECRET");
  },
  getSendgridApiKey: (): string => {
    return EnvironmentConfig.getEnvVariable("SENDGRID_API_KEY");
  },
  getInvitationEmailTemplate: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "SENDGRID_INVITATION_EMAIL_TEMPLATE_ID"
    );
  },
  getDustDataSourcesBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_DATA_SOURCES_BUCKET");
  },
  getServiceAccount: (): string => {
    return EnvironmentConfig.getEnvVariable("SERVICE_ACCOUNT");
  },
  getGaTrackingId: (): string => {
    return EnvironmentConfig.getEnvVariable("GA_TRACKING_ID");
  },
  getCustomerIoSiteId: (): string => {
    return EnvironmentConfig.getEnvVariable("CUSTOMERIO_SITE_ID");
  },
  getCustomerIoApiKey: (): string => {
    return EnvironmentConfig.getEnvVariable("CUSTOMERIO_API_KEY");
  },
  getCustomerIoEnabled: (): boolean => {
    return (
      EnvironmentConfig.getOptionalEnvVariable("CUSTOMERIO_ENABLED") === "true"
    );
  },
  getCoreAPIConfig: (): { url: string } => {
    return {
      url: EnvironmentConfig.getEnvVariable("CORE_API"),
    };
  },
  getConnectorsAPIConfig: (): { url: string; secret: string } => {
    return {
      url: EnvironmentConfig.getEnvVariable("CONNECTORS_API"),
      secret: EnvironmentConfig.getEnvVariable("DUST_CONNECTORS_SECRET"),
    };
  },
  getDustAPIConfig: (): { url: string; nodeEnv: string } => {
    return {
      // Dust production API URL is hardcoded for now.
      url: "https://dust.tt",
      nodeEnv: EnvironmentConfig.getEnvVariable("NODE_ENV"),
    };
  },
  getOAuthAPIConfig: (): { url: string } => {
    return {
      url: EnvironmentConfig.getEnvVariable("OAUTH_API"),
    };
  },
  getOAuthGithubApp: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_GITHUB_APP");
  },
};

export default config;
