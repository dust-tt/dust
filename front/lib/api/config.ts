import { EnvironmentConfig } from "@dust-tt/types";

export const PRODUCTION_DUST_API = "https://dust.tt";

const config = {
  getClientFacingUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_CLIENT_FACING_URL");
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
  getGenericEmailTemplate: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "SENDGRID_GENERIC_EMAIL_TEMPLATE_ID"
    );
  },
  getStripeSecretKey: (): string => {
    return EnvironmentConfig.getEnvVariable("STRIPE_SECRET_KEY");
  },
  getStripeSecretWebhookKey: (): string => {
    return EnvironmentConfig.getEnvVariable("STRIPE_SECRET_WEBHOOK_KEY");
  },
  getDustDataSourcesBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_DATA_SOURCES_BUCKET");
  },
  getServiceAccount: (): string => {
    return EnvironmentConfig.getEnvVariable("SERVICE_ACCOUNT");
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
  // Used for communication of front to (itself in prod) for dust-apps execution.
  getDustDevelopmentSystemAPIKey: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_DEVELOPMENT_SYSTEM_API_KEY");
  },
  getDustDevelopmentWorkspaceId: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_DEVELOPMENT_WORKSPACE_ID");
  },
  getCoreAPIConfig: (): { url: string; apiKey: string | null } => {
    return {
      url: EnvironmentConfig.getEnvVariable("CORE_API"),
      apiKey: EnvironmentConfig.getOptionalEnvVariable("CORE_API_KEY") ?? null,
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
      url:
        EnvironmentConfig.getOptionalEnvVariable("DUST_PROD_API") ??
        PRODUCTION_DUST_API,
      nodeEnv: EnvironmentConfig.getEnvVariable("NODE_ENV"),
    };
  },
  getOAuthAPIConfig: (): { url: string; apiKey: string | null } => {
    return {
      url: EnvironmentConfig.getEnvVariable("OAUTH_API"),
      apiKey: EnvironmentConfig.getOptionalEnvVariable("OAUTH_API_KEY") ?? null,
    };
  },
  getDevelopmentDustAppsWorkspaceId: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "DEVELOPMENT_DUST_APPS_WORKSPACE_ID"
    );
  },
  getDevelopmentDustAppsVaultId: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "DEVELOPMENT_DUST_APPS_VAULT_ID"
    );
  },
  // OAuth
  getOAuthGithubApp: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_GITHUB_APP");
  },
  getOAuthNotionClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_NOTION_CLIENT_ID");
  },
  getOAuthConfluenceClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_CONFLUENCE_CLIENT_ID");
  },
  getOAuthGoogleDriveClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_GOOGLE_DRIVE_CLIENT_ID");
  },
  getOAuthSlackClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_SLACK_CLIENT_ID");
  },
  getOAuthIntercomClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_INTERCOM_CLIENT_ID");
  },
  getOAuthGongClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_GONG_CLIENT_ID");
  },
  getOAuthMicrosoftClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_MICROSOFT_CLIENT_ID");
  },
  // Text extraction.
  getTextExtractionUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("TEXT_EXTRACTION_URL");
  },
  // Status page.
  getProviderStatusPageId: (): string => {
    return EnvironmentConfig.getEnvVariable("PROVIDER_STATUS_PAGE_ID");
  },
  getStatusPageApiToken: (): string => {
    return EnvironmentConfig.getEnvVariable("STATUS_PAGE_API_TOKEN");
  },
};

export default config;
