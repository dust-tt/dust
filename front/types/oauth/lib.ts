import * as t from "io-ts";

import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { PCKEConfig } from "@app/lib/utils/pkce";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const OAUTH_USE_CASES = [
  "connection",
  "labs_transcripts",
  "platform_actions",
  "salesforce_personal",
  "personal_actions",
] as const;

export type OAuthUseCase = (typeof OAUTH_USE_CASES)[number];

export function isOAuthUseCase(obj: unknown): obj is OAuthUseCase {
  return OAUTH_USE_CASES.includes(obj as OAuthUseCase);
}

export const OAUTH_PROVIDERS = [
  "confluence",
  "github",
  "google_drive",
  "gmail",
  "intercom",
  "notion",
  "slack",
  "gong",
  "microsoft",
  "zendesk",
  "salesforce",
  "hubspot",
] as const;

export const OAUTH_PROVIDER_NAMES: Record<OAuthProvider, string> = {
  confluence: "Confluence",
  github: "GitHub",
  google_drive: "Google Drive",
  gmail: "Gmail",
  intercom: "Intercom",
  notion: "Notion",
  slack: "Slack",
  gong: "Gong",
  microsoft: "Microsoft",
  zendesk: "Zendesk",
  salesforce: "Salesforce",
  hubspot: "Hubspot",
};

export const getProviderAdditionalClientSideAuthCredentials = async (
  authentication: AuthorizationInfo | null
): Promise<PCKEConfig | null> => {
  if (!authentication) {
    return null;
  }
  switch (authentication.provider) {
    case "salesforce":
    case "gmail":
      if (authentication.use_case === "personal_actions") {
        return getPKCEConfig();
      }
      return null;
    case "hubspot":
    case "zendesk":
    case "slack":
    case "gong":
    case "microsoft":
    case "notion":
    case "confluence":
    case "github":
    case "google_drive":
    case "intercom":
      return null;
    default:
      assertNever(authentication.provider);
  }
};

const SUPPORTED_OAUTH_CREDENTIALS = [
  "client_id",
  "client_secret",
  "instance_url",
  "code_verifier",
  "code_challenge",
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

export const getProviderRequiredOAuthCredentialInputs = async (
  authentication: AuthorizationInfo | null
): Promise<OAuthCredentialInputs | null> => {
  if (!authentication) {
    return null;
  }
  const additionalCredentials =
    await getProviderAdditionalClientSideAuthCredentials(authentication);

  switch (authentication.provider) {
    case "salesforce":
      if (authentication.use_case === "personal_actions") {
        const result: OAuthCredentialInputs = {
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
          instance_url: {
            label: "Instance URL",
            value: undefined,
            helpMessage:
              "Must be a valid Salesforce domain in https and ending with « .salesforce.com ».",
            validator: isValidSalesforceDomain,
          },
        };
        if (!additionalCredentials) {
          return result;
        }
        Object.entries(additionalCredentials).forEach(([key, value]) => {
          if (isSupportedOAuthCredential(key)) {
            result[key] = { label: key, value };
          }
        });
        return result;
      }
      return null;
    case "gmail":
      if (authentication.use_case === "personal_actions") {
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
        if (!additionalCredentials) {
          return result;
        }
        Object.entries(additionalCredentials).forEach(([key, value]) => {
          if (isSupportedOAuthCredential(key)) {
            result[key] = { label: key, value };
          }
        });
        return result;
      }
      return null;
    case "hubspot":
    case "zendesk":
    case "slack":
    case "gong":
    case "microsoft":
    case "notion":
    case "confluence":
    case "github":
    case "google_drive":
    case "intercom":
      if (!additionalCredentials) {
        return null;
      }
      const result: OAuthCredentialInputs = {};
      Object.entries(additionalCredentials).forEach(([key, value]) => {
        if (isSupportedOAuthCredential(key)) {
          result[key] = { label: key, value };
        }
      });
      return Object.keys(result).length > 0 ? result : null;
    default:
      assertNever(authentication.provider);
  }
};

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(obj: unknown): obj is OAuthProvider {
  return OAUTH_PROVIDERS.includes(obj as OAuthProvider);
}

export type OAuthConnectionType = {
  connection_id: string;
  created: number;
  metadata: Record<string, unknown>;
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

// Credentials Providers

export const PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS = [
  "gong",
  "modjo",
] as const;

export type ProvidersWithWorkspaceConfigurations =
  (typeof PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS)[number];

export const LABS_CONNECTION_PROVIDERS = ["hubspot", "linear"] as const;

export type LabsConnectionProvider = (typeof LABS_CONNECTION_PROVIDERS)[number];

export function isLabsConnectionProvider(
  obj: unknown
): obj is LabsConnectionProvider {
  return LABS_CONNECTION_PROVIDERS.includes(obj as LabsConnectionProvider);
}

export const CREDENTIALS_PROVIDERS = [
  "snowflake",
  "bigquery",
  "salesforce",
  // LABS
  "modjo",
  ...LABS_CONNECTION_PROVIDERS,
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

export const SnowflakeCredentialsSchema = t.type({
  username: t.string,
  password: t.string,
  account: t.string,
  role: t.string,
  warehouse: t.string,
});
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

export type ConnectionCredentials =
  | SnowflakeCredentials
  | BigQueryCredentialsWithLocation
  | SalesforceCredentials
  | ModjoCredentials
  | HubspotCredentials
  | LinearCredentials;

export function isSnowflakeCredentials(
  credentials: ConnectionCredentials
): credentials is SnowflakeCredentials {
  return "username" in credentials && "password" in credentials;
}

export function isModjoCredentials(
  credentials: ConnectionCredentials
): credentials is ModjoCredentials {
  return "api_key" in credentials;
}

export function isHubspotCredentials(
  credentials: ConnectionCredentials
): credentials is HubspotCredentials {
  return "accessToken" in credentials && "portalId" in credentials;
}

export function isLinearCredentials(
  credentials: ConnectionCredentials
): credentials is LinearCredentials {
  return "api_key" in credentials;
}

export function isBigQueryWithLocationCredentials(
  credentials: ConnectionCredentials
): credentials is BigQueryCredentialsWithLocation {
  return (
    "type" in credentials &&
    "project_id" in credentials &&
    "location" in credentials
  );
}

export function isSalesforceCredentials(
  credentials: ConnectionCredentials
): credentials is SalesforceCredentials {
  return "client_id" in credentials && "client_secret" in credentials;
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
