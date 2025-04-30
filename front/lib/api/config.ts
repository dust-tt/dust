import { EnvironmentConfig } from "@dust-tt/types";

export const PRODUCTION_DUST_API = "https://dust.tt";

const config = {
  getClientFacingUrl: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "NEXT_PUBLIC_DUST_CLIENT_FACING_URL"
    );
  },
  getAuth0TenantUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("AUTH0_TENANT_DOMAIN_URL");
  },
  getAuth0AudienceUri: (): string => {
    return EnvironmentConfig.getEnvVariable("AUTH0_AUDIENCE_URI");
  },
  getDustApiAudience: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_API_AUDIENCE");
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
  getAuth0ExtensionApplicationId: (): string => {
    return EnvironmentConfig.getEnvVariable("AUTH0_EXTENSION_CLIENT_ID");
  },
  getAuth0NamespaceClaim: (): string => {
    return EnvironmentConfig.getEnvVariable("AUTH0_CLAIM_NAMESPACE");
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
  getDustRegistrySecret: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_REGISTRY_SECRET");
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
      nodeEnv:
        EnvironmentConfig.getOptionalEnvVariable("NODE_ENV") || "development",
    };
  },
  getOAuthAPIConfig: (): { url: string; apiKey: string | null } => {
    return {
      url: EnvironmentConfig.getEnvVariable("OAUTH_API"),
      apiKey: EnvironmentConfig.getOptionalEnvVariable("OAUTH_API_KEY") ?? null,
    };
  },
  getDustAppsWorkspaceId: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_APPS_WORKSPACE_ID");
  },
  getDustAppsSpaceId: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_APPS_SPACE_ID");
  },
  getDustAppsHelperDatasourceViewId: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "DUST_APPS_HELPER_DATASOURCE_VIEW_ID"
    );
  },
  getRegionResolverSecret: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("REGION_RESOLVER_SECRET");
  },
  // OAuth
  getOAuthGithubApp: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_GITHUB_APP");
  },
  getOAuthGithubAppPlatformActions: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "OAUTH_GITHUB_APP_PLATFORM_ACTIONS"
    );
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
  getOAuthZendeskClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_ZENDESK_CLIENT_ID");
  },
  getOAuthSalesforceClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_SALESFORCE_CLIENT_ID");
  },
  // Text extraction.
  getTextExtractionUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("TEXT_EXTRACTION_URL");
  },
  // Status page.
  getStatusPageProvidersPageId: (): string => {
    return EnvironmentConfig.getEnvVariable("STATUS_PAGE_PROVIDERS_PAGE_ID");
  },
  getStatusPageDustPageId: (): string => {
    return EnvironmentConfig.getEnvVariable("STATUS_PAGE_DUST_PAGE_ID");
  },
  getStatusPageApiToken: (): string => {
    return EnvironmentConfig.getEnvVariable("STATUS_PAGE_API_TOKEN");
  },
  getMultiActionsAgentAnthropicBetaFlags: (): string[] | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "MULTI_ACTIONS_AGENT_ANTHROPIC_BETA_FLAGS"
    )?.split(",");
  },
};

export default config;
