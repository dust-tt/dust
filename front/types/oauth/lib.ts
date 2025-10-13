import * as t from "io-ts";

import { assertNever } from "@app/types/shared/utils/assert_never";
import { validateUrl } from "@app/types/shared/utils/url_utils";

export const OAUTH_USE_CASES = [
  "connection",
  "labs_transcripts",
  "platform_actions",
  "personal_actions",
  "bot",
] as const;

export type OAuthUseCase = (typeof OAUTH_USE_CASES)[number];

export type MCPOAuthUseCase = Extract<
  OAuthUseCase,
  "platform_actions" | "personal_actions"
>;

export function isOAuthUseCase(obj: unknown): obj is OAuthUseCase {
  return OAUTH_USE_CASES.includes(obj as OAuthUseCase);
}

export const OAUTH_PROVIDERS = [
  "confluence",
  "confluence_tools",
  "freshservice",
  "github",
  "google_drive",
  "gmail",
  "intercom",
  "jira",
  "monday",
  "notion",
  "slack",
  "gong",
  "microsoft",
  "microsoft_tools",
  "zendesk",
  "salesforce",
  "hubspot",
  "mcp", // MCP is a special provider for MCP servers.
  "mcp_static", // MCP static is a special provider for MCP servers requiring static OAuth credentials.
] as const;

export const OAUTH_PROVIDER_NAMES: Record<OAuthProvider, string> = {
  confluence: "Confluence",
  confluence_tools: "Confluence Tools",
  freshservice: "Freshservice",
  github: "GitHub",
  gmail: "Gmail",
  google_drive: "Google",
  intercom: "Intercom",
  jira: "Jira",
  monday: "Monday",
  notion: "Notion",
  slack: "Slack",
  gong: "Gong",
  microsoft: "Microsoft",
  microsoft_tools: "Microsoft Tools",
  zendesk: "Zendesk",
  salesforce: "Salesforce",
  hubspot: "Hubspot",
  mcp: "MCP",
  mcp_static: "MCP",
};

const SUPPORTED_OAUTH_CREDENTIALS = [
  "client_id",
  "client_secret",
  "instance_url",
  "code_verifier",
  "code_challenge",
  "scope",
  "token_endpoint",
  "authorization_endpoint",
  "freshservice_domain",
  "freshworks_org_url",
] as const;

export type SupportedOAuthCredentials =
  (typeof SUPPORTED_OAUTH_CREDENTIALS)[number];

export const isSupportedOAuthCredential = (
  obj: unknown
): obj is SupportedOAuthCredentials => {
  return SUPPORTED_OAUTH_CREDENTIALS.includes(obj as SupportedOAuthCredentials);
};

export type OAuthCredentialInput = {
  label: string;
  value: string | undefined;
  helpMessage?: string;
  validator?: (value: string) => boolean;
};

export type OAuthCredentialInputs = Partial<
  Record<SupportedOAuthCredentials, OAuthCredentialInput>
>;

export type OAuthCredentials = Partial<
  Record<SupportedOAuthCredentials, string>
>;

export const getProviderRequiredOAuthCredentialInputs = async ({
  provider,
  useCase,
}: {
  provider: OAuthProvider;
  useCase: OAuthUseCase;
}): Promise<OAuthCredentialInputs | null> => {
  switch (provider) {
    case "salesforce":
      if (useCase === "personal_actions" || useCase === "platform_actions") {
        const result: OAuthCredentialInputs = {
          instance_url: {
            label: "Instance URL",
            value: undefined,
            helpMessage:
              "Must be a valid Salesforce domain in https and ending with « .salesforce.com ».",
            validator: isValidSalesforceDomain,
          },
          client_id: {
            label: "OAuth Client ID",
            value: undefined,
            helpMessage: "The client ID from your Salesforce connected app.",
            validator: isValidClientIdOrSecret,
          },
          client_secret: {
            label: "OAuth Client Secret",
            value: undefined,
            helpMessage:
              "The client secret from your Salesforce connected app.",
            validator: isValidClientIdOrSecret,
          },
        };

        return result;
      }
      return null;
    case "gmail":
      if (useCase === "personal_actions" || useCase === "platform_actions") {
        const result: OAuthCredentialInputs = {
          client_id: {
            label: "OAuth Client ID",
            value: undefined,
            helpMessage: "The client ID from your Gmail connected app.",
            validator: isValidClientIdOrSecret,
          },
          client_secret: {
            label: "OAuth Client Secret",
            value: undefined,
            helpMessage: "The client secret from your Gmail connected app.",
            validator: isValidClientIdOrSecret,
          },
        };
        return result;
      }
      return null;
    case "freshservice":
      if (useCase === "personal_actions" || useCase === "platform_actions") {
        const result: OAuthCredentialInputs = {
          freshworks_org_url: {
            label: "Freshworks Organization URL",
            value: undefined,
            helpMessage:
              "Your Freshworks organization URL (e.g., yourcompany.myfreshworks.com).",
          },
          freshservice_domain: {
            label: "Freshservice Domain URL",
            value: undefined,
            helpMessage:
              "Your Freshservice domain URL (e.g., yourcompany.freshservice.com).",
          },
        };
        return result;
      }
      return null;
    case "hubspot":
    case "zendesk":
    case "slack":
    case "gong":
    case "microsoft":
    case "microsoft_tools":
    case "monday":
    case "notion":
    case "confluence":
    case "confluence_tools":
    case "github":
    case "google_drive":
    case "intercom":
    case "jira":
    case "mcp":
      return null;
    case "mcp_static":
      if (useCase === "personal_actions" || useCase === "platform_actions") {
        const result: OAuthCredentialInputs = {
          client_id: {
            label: "OAuth Client ID",
            value: undefined,
            helpMessage: "The client ID from your MCP server.",
            validator: isValidClientIdOrSecret,
          },
          client_secret: {
            label: "OAuth Client Secret",
            value: undefined,
            helpMessage: "The client secret from your MCP server.",
            validator: isValidClientIdOrSecret,
          },
          token_endpoint: {
            label: "OAuth Token Endpoint",
            value: undefined,
            helpMessage: "The token endpoint from your MCP server.",
            validator: isValidUrl,
          },
          authorization_endpoint: {
            label: "OAuth Authorization Endpoint",
            value: undefined,
            helpMessage: "The authorization endpoint from your MCP server.",
            validator: isValidUrl,
          },
          scope: {
            label: "OAuth Scope(s)",
            value: undefined,
            helpMessage: "The scope(s) to request (space separated list).",
            validator: isValidScope,
          },
        };
        return result;
      }
      return null;
    default:
      assertNever(provider);
  }
};

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(obj: unknown): obj is OAuthProvider {
  return OAUTH_PROVIDERS.includes(obj as OAuthProvider);
}

export function isValidScope(obj: unknown): obj is string | undefined {
  return !obj || typeof obj === "string";
}

export type OAuthConnectionType = {
  connection_id: string;
  created: number;
  metadata: Record<string, string>;
  provider: OAuthProvider;
  status: "pending" | "finalized";
};

export function isOAuthConnectionType(
  obj: unknown
): obj is OAuthConnectionType {
  const connection = obj as OAuthConnectionType;
  return (
    typeof connection.connection_id === "string" &&
    typeof connection.created === "number" &&
    isOAuthProvider(connection.provider) &&
    (connection.status === "pending" || connection.status === "finalized")
  );
}

// OAuth Providers utils

export function isValidZendeskSubdomain(s: unknown): s is string {
  return (
    typeof s === "string" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)
  );
}

export function isValidSalesforceDomain(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.startsWith("https://") &&
    s.endsWith(".salesforce.com")
  );
}

export function isValidClientIdOrSecret(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export function isValidUrl(s: unknown): s is string {
  return typeof s === "string" && validateUrl(s).valid;
}

// Credentials Providers

export const PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS = [
  "gong",
  "modjo",
] as const;

export type ProvidersWithWorkspaceConfigurations =
  (typeof PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS)[number];

export const CREDENTIALS_PROVIDERS = [
  "snowflake",
  "bigquery",
  "salesforce",
  "notion",
  // LABS
  "modjo",
] as const;
export type CredentialsProvider = (typeof CREDENTIALS_PROVIDERS)[number];

export function isCredentialProvider(obj: unknown): obj is CredentialsProvider {
  return CREDENTIALS_PROVIDERS.includes(obj as CredentialsProvider);
}

export function isProviderWithDefaultWorkspaceConfiguration(
  obj: unknown
): obj is ProvidersWithWorkspaceConfigurations {
  return PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS.includes(
    obj as ProvidersWithWorkspaceConfigurations
  );
}

// Credentials

// Base schema with common fields
const SnowflakeBaseCredentialsSchema = t.type({
  username: t.string,
  account: t.string,
  role: t.string,
  warehouse: t.string,
});

// Legacy schema for backward compatibility
export const SnowflakeLegacyCredentialsSchema = t.intersection([
  SnowflakeBaseCredentialsSchema,
  t.type({
    password: t.string,
  }),
]);

export const SnowflakePasswordCredentialsSchema = t.intersection([
  SnowflakeBaseCredentialsSchema,
  t.type({
    auth_type: t.literal("password"),
    password: t.string,
  }),
]);

export const SnowflakeKeyPairCredentialsSchema = t.intersection([
  SnowflakeBaseCredentialsSchema,
  t.type({
    auth_type: t.literal("keypair"),
    private_key: t.string,
    private_key_passphrase: t.union([t.string, t.undefined]),
  }),
]);

export const SnowflakeCredentialsSchema = t.union([
  SnowflakeLegacyCredentialsSchema,
  SnowflakePasswordCredentialsSchema,
  SnowflakeKeyPairCredentialsSchema,
]);

export type SnowflakeCredentials = t.TypeOf<typeof SnowflakeCredentialsSchema>;

export const CheckBigQueryCredentialsSchema = t.type({
  type: t.string,
  project_id: t.string,
  private_key_id: t.string,
  private_key: t.string,
  client_email: t.string,
  client_id: t.string,
  auth_uri: t.string,
  token_uri: t.string,
  auth_provider_x509_cert_url: t.string,
  client_x509_cert_url: t.string,
  universe_domain: t.string,
});

export type CheckBigQueryCredentials = t.TypeOf<
  typeof CheckBigQueryCredentialsSchema
>;

export const BigQueryCredentialsWithLocationSchema = t.type({
  type: t.string,
  project_id: t.string,
  private_key_id: t.string,
  private_key: t.string,
  client_email: t.string,
  client_id: t.string,
  auth_uri: t.string,
  token_uri: t.string,
  auth_provider_x509_cert_url: t.string,
  client_x509_cert_url: t.string,
  universe_domain: t.string,
  location: t.string,
});

export type BigQueryCredentialsWithLocation = t.TypeOf<
  typeof BigQueryCredentialsWithLocationSchema
>;

export const ApiKeyCredentialsSchema = t.type({
  api_key: t.string,
});
export type ModjoCredentials = t.TypeOf<typeof ApiKeyCredentialsSchema>;
export type LinearCredentials = t.TypeOf<typeof ApiKeyCredentialsSchema>;

export const HubspotCredentialsSchema = t.type({
  accessToken: t.string,
  portalId: t.string,
});
export type HubspotCredentials = t.TypeOf<typeof HubspotCredentialsSchema>;

export const SalesforceCredentialsSchema = t.type({
  client_id: t.string,
  client_secret: t.string,
});
export type SalesforceCredentials = t.TypeOf<
  typeof SalesforceCredentialsSchema
>;

export const NotionCredentialsSchema = t.type({
  integration_token: t.string,
});
export type NotionCredentials = t.TypeOf<typeof NotionCredentialsSchema>;

export type ConnectionCredentials =
  | SnowflakeCredentials
  | BigQueryCredentialsWithLocation
  | SalesforceCredentials
  | ModjoCredentials
  | HubspotCredentials
  | LinearCredentials
  | NotionCredentials;

export function isModjoCredentials(
  credentials: ConnectionCredentials
): credentials is ModjoCredentials {
  return "api_key" in credentials;
}

export type OauthAPIPostCredentialsResponse = {
  credential: {
    credential_id: string;
    provider: CredentialsProvider;
    created: number;
  };
};

export type OauthAPIGetCredentialsResponse = {
  credential: {
    credential_id: string;
    created: number;
    provider: CredentialsProvider;
    metadata: {
      workspace_id: string;
      user_id: string;
    };
    content: ConnectionCredentials;
  };
};
