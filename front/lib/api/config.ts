import { isDevelopment } from "@app/types/shared/env";
import { EnvironmentConfig } from "@app/types/shared/utils/config";

export const PRODUCTION_DUST_API = "https://dust.tt";

// Pluggable base URL resolver (e.g. RegionContext in the SPA).
let baseUrlResolver: (() => string) | null = null;

export function setBaseUrlResolver(fn: (() => string) | null): void {
  baseUrlResolver = fn;
}

// Returns the resolver's URL if set, or empty string.
// Used by clientFetch to decide whether to rewrite relative URLs (SPA cross-origin only).
export function getBaseUrl(): string {
  return baseUrlResolver?.() || "";
}

// Pluggable default RequestInit resolver (e.g. credentials/headers per context).
// The resolver may be async (e.g. to call getAccessToken() which refreshes expired tokens).
let defaultInitResolver: (() => Promise<RequestInit>) | null = null;

export function setDefaultInitResolver(
  fn: (() => Promise<RequestInit>) | null
): void {
  defaultInitResolver = fn;
}

export function getDefaultInit(): Promise<RequestInit> | null {
  return defaultInitResolver?.() ?? null;
}

const config = {
  // Dynamic API base URL: uses a custom resolver when set (SPA region switching),
  // otherwise falls back to getClientFacingUrl().
  getApiBaseUrl: (): string => {
    const url = baseUrlResolver?.();
    if (url) {
      return url;
    }

    // We override the NEXT_PUBLIC_DUST_API_URL in `front-internal` to ensure that the
    // uploadUrl returned by the file API points to the `http://front-internal-service` and not our
    // public API URL.
    let override = EnvironmentConfig.getOptionalEnvVariable(
      "DUST_INTERNAL_API_URL"
    );
    if (override) {
      return override;
    }

    // Using process.env here to make sure the function is usable on the client side.
    if (!process.env.NEXT_PUBLIC_DUST_API_URL) {
      throw new Error("NEXT_PUBLIC_DUST_API_URL is not set");
    }
    return process.env.NEXT_PUBLIC_DUST_API_URL;
  },

  getStaticWebsiteUrl: (): string => {
    // Using process.env here to make sure the function is usable on the client side.
    if (!process.env.NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL) {
      throw new Error("NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL is not set");
    }
    return process.env.NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL;
  },
  // URL for the main app pages (/w/..., /share/..., etc.).
  // Use this for page URLs, not API endpoints.
  getAppUrl: (): string => {
    // Using process.env here to make sure the function is usable on the client side.
    if (!process.env.NEXT_PUBLIC_DUST_APP_URL) {
      throw new Error("NEXT_PUBLIC_DUST_APP_URL is required");
    }

    return process.env.NEXT_PUBLIC_DUST_APP_URL;
  },
  // URL for the poke app (front-spa). Falls back to getClientFacingUrl()/poke when not set.
  getPokeAppUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("POKE_APP_URL");
  },
  // For OAuth/WorkOS redirects. Allows overriding the redirect base URL separately
  // from NEXT_PUBLIC_DUST_API_URL. Falls back to getClientFacingUrl() when not set.
  getAuthRedirectBaseUrl: (): string => {
    return (
      EnvironmentConfig.getOptionalEnvVariable("DUST_AUTH_REDIRECT_BASE_URL") ??
      config.getApiBaseUrl()
    );
  },
  getDustInviteTokenSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_INVITE_TOKEN_SECRET");
  },
  getIPInfoApiToken: (): string => {
    return EnvironmentConfig.getEnvVariable("IPINFO_API_TOKEN");
  },
  getSendgridApiKey: (): string => {
    return EnvironmentConfig.getEnvVariable("SENDGRID_API_KEY");
  },
  // Dedicated Anthropic API key scoped to our EAP workspace. Optional: only set
  // in deployments that serve EAP models (those with `useEapKey` in their config).
  getAnthropicEapApiKey: (): string | null => {
    return (
      EnvironmentConfig.getOptionalEnvVariable("ANTHROPIC_EAP_API_KEY") ?? null
    );
  },
  // Anthropic API key for Dust-managed features (e.g. the Academy quiz chat).
  // Optional: only set in deployments that serve these features.
  getDustManagedAnthropicApiKey: (): string | null => {
    return (
      EnvironmentConfig.getOptionalEnvVariable(
        "DUST_MANAGED_ANTHROPIC_API_KEY"
      ) ?? null
    );
  },
  getSupportEmailAddress: (): { name: string; email: string } => {
    return {
      name: "Dust team",
      email: "support@dust.tt",
    };
  },
  getInvitationEmailTemplate: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "SENDGRID_INVITATION_EMAIL_TEMPLATE_ID"
    );
  },
  getInvitationReminderEmailTemplate: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "SENDGRID_INVITATION_REMINDER_EMAIL_TEMPLATE_ID"
    );
  },
  getGenericEmailTemplate: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "SENDGRID_GENERIC_EMAIL_TEMPLATE_ID"
    );
  },
  getStripePublishableKey: (): string => {
    // Using process.env here to make sure the function is usable on the client side.
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    }
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  },
  getTurnstileSiteKey: (): string => {
    // Using process.env here to make sure the function is usable on the client side.
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    }
    // Cloudflare-published "always passes" dummy sitekey for local dev:
    // https://developers.cloudflare.com/turnstile/troubleshooting/testing/
    if (isDevelopment()) {
      // return "3x00000000000000000000FF"; // forces interactive challenge
      // return "2x00000000000000000000AB"; // always fails and visible
      return "1x00000000000000000000AA"; // always succeeds and visible
    }
    throw new Error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set");
  },
  getTurnstileSecretKey: (): string => {
    // Cloudflare-published "always validates" dummy secret for local dev:
    // https://developers.cloudflare.com/turnstile/troubleshooting/testing/
    if (isDevelopment()) {
      // return "2x0000000000000000000000000000000AA" // always fails validation
      return "1x0000000000000000000000000000000AA"; // always passes validation
    }
    return EnvironmentConfig.getEnvVariable("TURNSTILE_SECRET_KEY");
  },
  getStripeSecretKey: (): string => {
    return EnvironmentConfig.getEnvVariable("STRIPE_SECRET_KEY");
  },
  getStripeSecretWebhookKey: (): string => {
    return EnvironmentConfig.getEnvVariable("STRIPE_SECRET_WEBHOOK_KEY");
  },
  // Twilio (workspace verification - OTP).
  getTwilioAccountSid: (): string => {
    return EnvironmentConfig.getEnvVariable("TWILIO_ACCOUNT_SID");
  },
  getTwilioAuthToken: (): string => {
    return EnvironmentConfig.getEnvVariable("TWILIO_AUTH_TOKEN");
  },
  getTwilioVerifyServiceSid: (): string => {
    return EnvironmentConfig.getEnvVariable("TWILIO_VERIFY_SERVICE_SID");
  },
  // Persona (workspace verification - phone risk).
  getPersonaApiKey: (): string => {
    return EnvironmentConfig.getEnvVariable("PERSONA_API_KEY");
  },
  getServiceAccount: (): string => {
    return EnvironmentConfig.getEnvVariable("SERVICE_ACCOUNT");
  },
  getPostHogApiKey: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("NEXT_PUBLIC_POSTHOG_KEY");
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
  getConnectorsAPIConfig: (): {
    url: string;
    secret: string;
    webhookSecret: string;
  } => {
    return {
      url: EnvironmentConfig.getEnvVariable("CONNECTORS_API"),
      secret: EnvironmentConfig.getEnvVariable("DUST_CONNECTORS_SECRET"),
      webhookSecret: EnvironmentConfig.getEnvVariable(
        "DUST_CONNECTORS_WEBHOOKS_SECRET"
      ),
    };
  },
  getDustAPIConfig: (): { url: string; nodeEnv: string } => {
    return {
      // Dust production API URL is hardcoded for now.
      url:
        EnvironmentConfig.getOptionalEnvVariable("DUST_PROD_API") ??
        PRODUCTION_DUST_API,
      nodeEnv:
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        EnvironmentConfig.getOptionalEnvVariable("NODE_ENV") || "development",
    };
  },
  getVizJwtSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("VIZ_JWT_SECRET");
  },
  getAcademyJwtSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_ACADEMY_JWT_SECRET");
  },
  getSandboxJwtSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_SANDBOX_JWT_SECRET");
  },
  getEgressProxyJwtSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("EGRESS_PROXY_JWT_SECRET");
  },
  getEgressProxyHost: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("EGRESS_PROXY_HOST");
  },
  getEgressProxyPort: (): number => {
    const value =
      EnvironmentConfig.getOptionalEnvVariable("EGRESS_PROXY_PORT") ?? "4443";
    const port = Number.parseInt(value, 10);

    if (Number.isNaN(port) || port <= 0) {
      throw new Error("EGRESS_PROXY_PORT must be a positive integer");
    }

    return port;
  },
  getEgressProxyTlsName: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("EGRESS_PROXY_TLS_NAME");
  },
  getEgressPolicyBucket: (): string => {
    return EnvironmentConfig.getEnvVariable("EGRESS_PROXY_POLICY_BUCKET");
  },
  getEgressProxyInternalUrl: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "EGRESS_PROXY_INTERNAL_URL"
    );
  },
  getOAuthAPIConfig: (): { url: string; apiKey: string | null } => {
    return {
      url: EnvironmentConfig.getEnvVariable("OAUTH_API"),
      apiKey: EnvironmentConfig.getOptionalEnvVariable("OAUTH_API_KEY") ?? null,
    };
  },
  getRegionResolverSecret: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("REGION_RESOLVER_SECRET");
  },
  getRegion: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("REGION");
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
  getOAuthGithubAppPersonalActions: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "OAUTH_GITHUB_APP_PLATFORM_ACTIONS_CLIENT_ID"
    );
  },
  getOAuthGithubAppWebhooks: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "OAUTH_GITHUB_APP_WEBHOOKS_CLIENT_ID"
    );
  },
  getOAuthNotionClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_NOTION_CLIENT_ID");
  },
  getOAuthNotionPlatformActionsClientId: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "OAUTH_NOTION_PLATFORM_ACTIONS_CLIENT_ID"
    );
  },
  getOAuthConfluenceClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_CONFLUENCE_CLIENT_ID");
  },
  getOAuthConfluenceToolsClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_CONFLUENCE_TOOLS_CLIENT_ID");
  },
  getOAuthGoogleDriveClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_GOOGLE_DRIVE_CLIENT_ID");
  },
  getGoogleDrivePickerApiKey: (): string => {
    return EnvironmentConfig.getEnvVariable("GOOGLE_DRIVE_PICKER_API_KEY");
  },
  getOAuthSlackClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_SLACK_CLIENT_ID");
  },
  getOAuthSlackBotClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_SLACK_BOT_CLIENT_ID");
  },
  getOAuthSlackToolsClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_SLACK_TOOLS_CLIENT_ID");
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
  getOAuthMicrosoftToolsClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_MICROSOFT_TOOLS_CLIENT_ID");
  },
  getOAuthZendeskClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_ZENDESK_CLIENT_ID");
  },
  getOAuthProductboardClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_PRODUCTBOARD_CLIENT_ID");
  },
  getOAuthHubspotClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_HUBSPOT_CLIENT_ID");
  },
  getOAuthFreshserviceClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_FRESHWORKS_CLIENT_ID");
  },
  getOAuthFreshserviceDomain: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_FRESHWORKS_DOMAIN");
  },
  getOAuthJiraClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_JIRA_CLIENT_ID");
  },
  getOAuthMondayClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_MONDAY_CLIENT_ID");
  },
  getOAuthDiscordClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_DISCORD_CLIENT_ID");
  },
  getOAuthFathomClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_FATHOM_CLIENT_ID");
  },
  getDevOAuthRedirectBaseUrl: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "DEV_OAUTH_REDIRECT_BASE_URL"
    );
  },
  getOAuthLinearClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("OAUTH_LINEAR_CLIENT_ID");
  },

  // Text extraction.
  getTextExtractionUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("TEXT_EXTRACTION_URL");
  },
  getDocumentRendererUrl: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("DOCUMENT_RENDERER_URL");
  },
  // In local dev Gotenberg runs in Docker and cannot reach localhost.
  // Set DOCUMENT_RENDERER_APP_URL=http://host.docker.internal:3011 in .env.local.
  getDocumentRendererAppUrl: (): string => {
    return (
      EnvironmentConfig.getOptionalEnvVariable("DOCUMENT_RENDERER_APP_URL") ??
      config.getAppUrl()
    );
  },
  // API URL reachable from Gotenberg's Chromium (inside Docker).
  // Set DOCUMENT_RENDERER_API_URL=http://host.docker.internal:3000 in .env.local.
  getDocumentRendererApiUrl: (): string => {
    return (
      EnvironmentConfig.getOptionalEnvVariable("DOCUMENT_RENDERER_API_URL") ??
      config.getApiBaseUrl()
    );
  },
  // Public viz URL (used by Gotenberg which routes through egress proxy).
  getVizPublicUrl: (): string => {
    return EnvironmentConfig.getEnvVariable("VIZ_PUBLIC_URL");
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

  // WorkOS
  getWorkOSApiKey: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_API_KEY");
  },
  getWorkOSClientId: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_CLIENT_ID");
  },
  getWorkOSCookiePassword: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_COOKIE_PASSWORD");
  },
  getWorkOSIssuerURL: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_ISSUER_URL");
  },
  getWorkOSWebhookSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_WEBHOOK_SECRET");
  },
  getWorkOSWebhookSigningSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_WEBHOOK_SIGNING_SECRET");
  },
  getWorkOSActionSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_ACTION_SECRET");
  },
  getWorkOSActionSigningSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_ACTION_SIGNING_SECRET");
  },
  getWorkOSSessionCookieDomain: (): string | undefined => {
    return isDevelopment()
      ? undefined
      : EnvironmentConfig.getEnvVariable("WORKOS_SESSION_COOKIE_DOMAIN");
  },
  getWorkOSEnvironmentId: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_ENVIRONMENT_ID");
  },
  getWorkOSAuthKitDomain: (): string => {
    return EnvironmentConfig.getEnvVariable("WORKOS_AUTHKIT_DOMAIN");
  },
  // Profiler.
  getProfilerSecret: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("DEBUG_PROFILER_SECRET");
  },
  getApolloApiKey: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("APOLLO_API_KEY");
  },
  getRedisUri: (): string => {
    return EnvironmentConfig.getEnvVariable("REDIS_URI");
  },
  getRedisCacheUri: (): string => {
    return EnvironmentConfig.getEnvVariable("REDIS_CACHE_URI");
  },
  getContentfulSpaceId: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("CONTENTFUL_SPACE_ID");
  },
  getContentfulAccessToken: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("CONTENTFUL_ACCESS_TOKEN");
  },
  getContentfulEnvironment: (): string => {
    return (
      EnvironmentConfig.getOptionalEnvVariable("CONTENTFUL_ENVIRONMENT") ??
      "master"
    );
  },
  getContentfulPreviewSecret: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "CONTENTFUL_PREVIEW_SECRET"
    );
  },
  getContentfulPreviewToken: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("CONTENTFUL_PREVIEW_TOKEN");
  },
  // Untrusted egress proxy.
  getUntrustedEgressProxyHost: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "UNTRUSTED_EGRESS_PROXY_HOST"
    );
  },
  getUntrustedEgressProxyPort: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "UNTRUSTED_EGRESS_PROXY_PORT"
    );
  },
  getElasticsearchConfig: (): {
    url: string;
    username: string;
    password: string;
  } => {
    return {
      url: EnvironmentConfig.getEnvVariable("ELASTICSEARCH_URL"),
      username: EnvironmentConfig.getEnvVariable("ELASTICSEARCH_USERNAME"),
      password: EnvironmentConfig.getEnvVariable("ELASTICSEARCH_PASSWORD"),
    };
  },
  isLangfuseEnabled: (): boolean => {
    const isEnabled =
      EnvironmentConfig.getOptionalEnvVariable(
        "LANGFUSE_ENABLED"
      )?.toLowerCase() === "true";

    if (isEnabled) {
      // If enabled, ensure that all keys are present.
      EnvironmentConfig.getEnvVariable("LANGFUSE_PUBLIC_KEY");
      EnvironmentConfig.getEnvVariable("LANGFUSE_SECRET_KEY");
      EnvironmentConfig.getOptionalEnvVariable("LANGFUSE_BASE_URL");
    }

    return isEnabled;
  },
  getLangfuseClientConfig: (): {
    publicKey: string;
    secretKey: string;
    baseUrl: string | undefined;
  } => {
    return {
      publicKey: EnvironmentConfig.getEnvVariable("LANGFUSE_PUBLIC_KEY"),
      secretKey: EnvironmentConfig.getEnvVariable("LANGFUSE_SECRET_KEY"),
      baseUrl: EnvironmentConfig.getOptionalEnvVariable("LANGFUSE_BASE_URL"),
    };
  },
  getLangfuseUiBaseUrl: () => {
    return EnvironmentConfig.getOptionalEnvVariable("LANGFUSE_UI_BASE_URL");
  },
  getTemporalConnectorsNamespace: () => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "TEMPORAL_CONNECTORS_NAMESPACE"
    );
  },
  getTemporalAgentNamespace: () => {
    return EnvironmentConfig.getOptionalEnvVariable("TEMPORAL_AGENT_NAMESPACE");
  },
  getTemporalFrontNamespace: () => {
    return EnvironmentConfig.getOptionalEnvVariable("TEMPORAL_NAMESPACE");
  },
  // Deployment component name. Set via DD_SERVICE in helm values per deployment.
  getServiceName: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("DD_SERVICE");
  },
  // Email.
  getEmailWebhookSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("EMAIL_WEBHOOK_SECRET");
  },
  getSendgridParseWebhookPublicKey: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "SENDGRID_PARSE_WEBHOOK_PUBLIC_KEY"
    );
  },
  getProductionDustWorkspaceId: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "PRODUCTION_DUST_WORKSPACE_ID"
    );
  },
  // Email validation secret for HMAC signing of action approval tokens.
  getEmailValidationSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("EMAIL_VALIDATION_SECRET");
  },
  // Secret for signing gated asset download tokens (ebooks, whitepapers, etc.).
  getGatedAssetsTokenSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("GATED_ASSETS_TOKEN_SECRET");
  },
  // Secrets for secure storage of keys and bearer tokens.
  getDeveloperSecretsSecret: (): string => {
    return EnvironmentConfig.getEnvVariable("DUST_DEVELOPERS_SECRETS_SECRET");
  },
  getMCPServerCredentialsSecret: (): string => {
    return EnvironmentConfig.getEnvVariable(
      "DUST_MCP_SERVER_CREDENTIALS_SECRET"
    );
  },
  // E2B Sandbox.
  getE2BSandboxConfig: (): {
    apiKey: string;
    domain: string | undefined;
  } => {
    return {
      apiKey: EnvironmentConfig.getEnvVariable("E2B_API_KEY"),
      domain: EnvironmentConfig.getOptionalEnvVariable("E2B_DOMAIN"),
    };
  },
  getDatadogApiKey: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("DD_API_KEY");
  },
  getSandboxDevFrontHostName: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "SBX_DEV_FRONT_URL"
    )?.replace(/^https?:\/\//, "");
  },
  // Dev-only switch to fully unrestrict sandbox network egress: skips the
  // dsbx forwarder, tears down in-sandbox nftables redirect, and lets E2B
  // allow all outbound traffic. Only honored when isDevelopment() to avoid
  // accidental enablement in production.
  getSandboxDevUnrestrictedEgress: (): boolean => {
    if (!isDevelopment()) {
      return false;
    }
    return (
      EnvironmentConfig.getOptionalEnvVariable(
        "SBX_DEV_UNRESTRICTED_EGRESS"
      ) === "true"
    );
  },
  getSandboxGcpArtifactServiceAccountPath: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "SBX_GCP_ARTIFACT_SERVICE_ACCOUNT"
    );
  },
  getSandboxGcpArtifactRegistry: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "SBX_GCP_ARTIFACT_REGISTRY"
    );
  },
  getGoogleCloudProjectId: (): string => {
    return EnvironmentConfig.getEnvVariable("GOOGLE_CLOUD_PROJECT_ID");
  },
  // Novu notifications.
  getNovuSecretKey: (): string => {
    return EnvironmentConfig.getEnvVariable("NOVU_SECRET_KEY");
  },
  getNovuApiUrl: (): string => {
    // Using process.env here to make sure the function is usable on the client side.
    if (!process.env.NEXT_PUBLIC_NOVU_API_URL) {
      throw new Error("NEXT_PUBLIC_NOVU_API_URL is not set");
    }
    return process.env.NEXT_PUBLIC_NOVU_API_URL;
  },
  // Metronome billing.
  getMetronomeApiKey: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("METRONOME_API_KEY");
  },
  getMetronomeWebhookSecret: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("METRONOME_WEBHOOK_SECRET");
  },
  // Pins which Stripe billing-provider delivery method (connection) to use when
  // the Metronome org has more than one Stripe DIRECT_TO_BILLING_PROVIDER
  // configuration (the bare delivery_method is ambiguous and rejected). Must be
  // a delivery_method_id (UUID), discoverable via
  // `scripts/list_metronome_delivery_methods.ts`. Leave unset when the org has a
  // single Stripe connection (e.g. prod); Metronome then resolves the bare
  // delivery_method.
  getMetronomeStripeDeliveryMethodId: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable(
      "METRONOME_STRIPE_DELIVERY_METHOD_ID"
    );
  },
  getVertexAiProjectId: (): string => {
    return EnvironmentConfig.getEnvVariable("VERTEX_AI_PROJECT_ID");
  },
  getDustWebhooksPublicUrl: (): string | undefined => {
    return EnvironmentConfig.getOptionalEnvVariable("DUST_WEBHOOKS_PUBLIC_URL");
  },
  getConvertAPIKey: (): string => {
    return EnvironmentConfig.getEnvVariable("CONVERTAPI_API_KEY");
  },
};

export default config;
