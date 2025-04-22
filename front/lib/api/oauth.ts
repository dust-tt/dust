import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isManaged } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import type {
  OAuthAPIError,
  OAuthConnectionType,
  OAuthProvider,
  OAuthUseCase,
  Result,
} from "@app/types";
import {
  ConnectorsAPI,
  Err,
  isValidSalesforceDomain,
  isValidZendeskSubdomain,
  OAuthAPI,
  Ok,
} from "@app/types";

export type OAuthError = {
  code:
    | "connection_creation_failed"
    | "connection_not_implemented"
    | "connection_finalization_failed";
  message: string;
  oAuthAPIError?: OAuthAPIError;
};

function getStringFromQuery(query: ParsedUrlQuery, key: string): string | null {
  const value = query[key];
  if (typeof value != "string") {
    return null;
  }
  return value;
}

function finalizeUriForProvider(provider: OAuthProvider): string {
  return config.getClientFacingUrl() + `/oauth/${provider}/finalize`;
}

const PROVIDER_STRATEGIES: Record<
  OAuthProvider,
  {
    setupUri: ({
      connection,
      useCase,
      clientId,
      forceLabelsScope,
      relatedCredential,
      extraConfig,
    }: {
      connection: OAuthConnectionType;
      useCase: OAuthUseCase;
      clientId?: string;
      forceLabelsScope?: boolean;
      relatedCredential?: {
        content: Record<string, unknown>;
        metadata: { workspace_id: string; user_id: string };
      };
      extraConfig?: Record<string, string>;
    }) => string;
    codeFromQuery: (query: ParsedUrlQuery) => string | null;
    connectionIdFromQuery: (query: ParsedUrlQuery) => string | null;
    isExtraConfigValid: (
      extraConfig: Record<string, string>,
      useCase: OAuthUseCase
    ) => boolean;
    getRelatedCredential?: (
      auth: Authenticator,
      extraConfig: Record<string, string>,
      workspaceId: string,
      userId: string,
      useCase: OAuthUseCase
    ) => Promise<{
      credential: {
        content: Record<string, unknown>;
        metadata: { workspace_id: string; user_id: string };
      };
      cleanedConfig: Record<string, string>;
    } | null>;
  }
> = {
  github: {
    setupUri: ({ connection, useCase }) => {
      const app =
        useCase === "platform_actions"
          ? config.getOAuthGithubAppPlatformActions()
          : config.getOAuthGithubApp();
      // Only the `installations/new` URL supports state passing.
      return (
        `https://github.com/apps/${app}/installations/new` +
        `?state=${connection.connection_id}`
      );
    },
    // {
    //   installation_id: '52689080',
    //   setup_action: 'update',
    //   state: 'con_...-...',
    //   provider: 'github'
    // }
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "installation_id");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  google_drive: {
    setupUri: ({ connection, useCase, forceLabelsScope }) => {
      const scopes =
        useCase === "labs_transcripts"
          ? ["https://www.googleapis.com/auth/drive.meet.readonly"]
          : [
              "https://www.googleapis.com/auth/drive.metadata.readonly",
              "https://www.googleapis.com/auth/drive.readonly",
            ];

      if (forceLabelsScope) {
        scopes.push("https://www.googleapis.com/auth/drive.labels.readonly");
      }
      const qs = querystring.stringify({
        response_type: "code",
        client_id: config.getOAuthGoogleDriveClientId(),
        state: connection.connection_id,
        redirect_uri: finalizeUriForProvider("google_drive"),
        scope: scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
      });
      return `https://accounts.google.com/o/oauth2/auth?${qs}`;
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  notion: {
    setupUri: ({ connection }) => {
      return (
        `https://api.notion.com/v1/oauth/authorize?owner=user` +
        `&response_type=code` +
        `&client_id=${config.getOAuthNotionClientId()}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("notion"))}`
      );
    },
    // {
    //   code: '03...',
    //   state: 'con_...-...',
    // }
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  slack: {
    setupUri: ({ connection }) => {
      const scopes = [
        "app_mentions:read",
        "channels:history",
        "channels:join",
        "channels:read",
        "chat:write",
        "groups:history",
        "groups:read",
        "im:history",
        "metadata.message:read",
        "mpim:read",
        "team:read",
        "users:read",
        "users:read.email",
        "im:read",
        "mpim:history",
        "files:read",
      ];
      return (
        `https://slack.com/oauth/v2/authorize?` +
        `client_id=${config.getOAuthSlackClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("slack"))}` +
        `&state=${connection.connection_id}`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  confluence: {
    setupUri: ({ connection }) => {
      const scopes = [
        "read:confluence-space.summary",
        "read:confluence-content.all",
        "read:confluence-user",
        "search:confluence",
        "read:space:confluence",
        "read:page:confluence",
        "read:confluence-props",
        "read:confluence-content.summary",
        "report:personal-data",
        "read:me",
        "read:label:confluence",
        "offline_access",
      ];
      return (
        `https://auth.atlassian.com/authorize?audience=api.atlassian.com` +
        `&client_id=${config.getOAuthConfluenceClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("confluence"))}` +
        `&state=${connection.connection_id}` +
        `&response_type=code&prompt=consent`
      );
    },
    // {
    //   code: 'ey...',
    //   state: 'con_...-...',
    // }
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  intercom: {
    setupUri: ({ connection }) => {
      return (
        `https://app.intercom.com/oauth` +
        `?client_id=${config.getOAuthIntercomClientId()}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("intercom"))}`
      );
    },
    codeFromQuery: (connection) => {
      return getStringFromQuery(connection, "code");
    },
    connectionIdFromQuery: (connection) => {
      return getStringFromQuery(connection, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  gong: {
    setupUri: ({ connection }) => {
      const scopes = [
        "api:calls:read:transcript",
        "api:calls:read:extensive",
        "api:calls:read:basic",
        "api:users:read",
      ];
      return (
        `https://app.gong.io/oauth2/authorize?` +
        `client_id=${config.getOAuthGongClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&response_type=code` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("gong"))}`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  microsoft: {
    setupUri: ({ connection, relatedCredential }) => {
      const scopes = [
        "User.Read",
        "Sites.Read.All",
        "Directory.Read.All",
        "Files.Read.All",
        "Team.ReadBasic.All",
        "ChannelSettings.Read.All",
        "ChannelMessage.Read.All",
        "offline_access",
      ];
      if (relatedCredential) {
        return `${config.getClientFacingUrl()}/oauth/microsoft/finalize?provider=microsoft&code=client&state=${connection.connection_id}`;
      } else {
        const qs = querystring.stringify({
          response_type: "code",
          client_id: config.getOAuthMicrosoftClientId(),
          state: connection.connection_id,
          redirect_uri: finalizeUriForProvider("microsoft"),
          scope: scopes.join(" "),
        });
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${qs}`;
      }
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return (
        Object.keys(extraConfig).length === 0 ||
        !!(
          extraConfig.client_id &&
          extraConfig.client_secret &&
          extraConfig.tenant_id
        )
      );
    },
    getRelatedCredential: async (auth, extraConfig, workspaceId, userId) => {
      const { client_id, client_secret, ...restConfig } = extraConfig;
      if (!client_id || !client_secret) {
        return null;
      }
      return {
        credential: {
          content: {
            client_id,
            client_secret,
          },
          metadata: { workspace_id: workspaceId, user_id: userId },
        },
        cleanedConfig: restConfig,
      };
    },
  },
  zendesk: {
    setupUri: ({ connection }) => {
      const scopes = ["read"];
      if (!isValidZendeskSubdomain(connection.metadata.zendesk_subdomain)) {
        throw "Invalid Zendesk subdomain";
      }
      return (
        `https://${connection.metadata.zendesk_subdomain}.zendesk.com/oauth/authorizations/new?` +
        `client_id=${config.getOAuthZendeskClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&response_type=code` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("zendesk"))}`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      if (Object.keys(extraConfig).length !== 1) {
        return false;
      }
      // Ensure the string is less than 63 characters.
      return isValidZendeskSubdomain(extraConfig.zendesk_subdomain);
    },
  },
  salesforce: {
    setupUri: ({ connection, clientId }) => {
      if (!connection.metadata.instance_url) {
        throw new Error("Missing Salesforce instance URL");
      }
      if (
        !connection.metadata.code_verifier ||
        !connection.metadata.code_challenge
      ) {
        throw new Error("Missing PKCE code verifier or challenge");
      }

      if (!clientId) {
        throw new Error("Missing Salesforce client ID");
      }
      return (
        `${connection.metadata.instance_url}/services/oauth2/authorize` +
        `?response_type=code` +
        `&client_id=${clientId}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("salesforce"))}` +
        `&code_challenge=${connection.metadata.code_challenge}` +
        `&code_challenge_method=S256`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig, useCase) => {
      if (useCase === "salesforce_personal") {
        return true;
      }

      if (!extraConfig.instance_url || !extraConfig.client_id) {
        return false;
      }
      return isValidSalesforceDomain(extraConfig.instance_url);
    },
    getRelatedCredential: async (
      auth,
      extraConfig,
      workspaceId,
      userId,
      useCase
    ) => {
      if (useCase === "salesforce_personal") {
        // For personal connection, we reuse the existing connection credential id
        // from the existing data source, if it exists.
        const dataSources = await DataSourceResource.listByConnectorProvider(
          auth,
          "salesforce"
        );
        if (dataSources.length !== 1) {
          return null;
        }
        const dataSource = dataSources[0].toJSON();
        if (!isManaged(dataSource)) {
          return null;
        }

        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );
        const connectorRes =
          await connectorsAPI.getConnectorFromDataSource(dataSource);
        if (connectorRes.isErr()) {
          return null;
        }

        const connector = connectorRes.value;

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getAccessToken({
          provider: "salesforce",
          connectionId: connector.connectionId,
        });
        if (connectionRes.isErr()) {
          return null;
        }
        const connection = connectionRes.value.connection;
        const connectionId = connection.connection_id;

        return {
          credential: {
            content: {
              from_connection_id: connectionId,
            },
            metadata: { workspace_id: workspaceId, user_id: userId },
          },
          cleanedConfig: {
            client_id: connection.metadata.client_id as string,
            instance_url: connection.metadata.instance_url as string,
            ...extraConfig,
          },
        };
      } else {
        const { client_secret, ...restConfig } = extraConfig;
        // Keep client_id in metadata in clear text.
        return {
          credential: {
            content: {
              client_secret,
              client_id: extraConfig.client_id,
            },
            metadata: { workspace_id: workspaceId, user_id: userId },
          },
          cleanedConfig: restConfig,
        };
      }
    },
  },
  hubspot: {
    setupUri: ({ connection }) => {
      const scopes = [
        "crm.objects.companies.read",
        "crm.objects.companies.write",
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
        "crm.objects.custom.read",
        "crm.objects.custom.write",
        "crm.objects.deals.read",
        "crm.objects.deals.write",
        "crm.objects.leads.read",
        "crm.objects.leads.write",
        "crm.objects.owners.read",
        "crm.schemas.contacts.read",
        "crm.schemas.custom.read",
        "crm.schemas.companies.read",
        "crm.schemas.deals.read",
        "oauth",
      ];
      return (
        `https://app.hubspot.com/oauth/authorize` +
        `?client_id=${config.getOAuthHubspotClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("hubspot"))}` +
        `&state=${connection.connection_id}`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
};

export async function createConnectionAndGetSetupUrl(
  auth: Authenticator,
  provider: OAuthProvider,
  useCase: OAuthUseCase,
  extraConfig: Record<string, string>
): Promise<Result<string, OAuthError>> {
  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  if (!PROVIDER_STRATEGIES[provider].isExtraConfigValid(extraConfig, useCase)) {
    logger.error(
      { provider, useCase, extraConfig },
      "OAuth: Invalid extraConfig"
    );
    return new Err({
      code: "connection_creation_failed",
      message: "Invalid OAuth connection extraConfig for provider",
    });
  }

  // Extract related credential and update config if the provider has a method for it
  let relatedCredential:
    | {
        content: Record<string, unknown>;
        metadata: { workspace_id: string; user_id: string };
      }
    | undefined = undefined;
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const userId = auth.getNonNullableUser().sId;

  if (PROVIDER_STRATEGIES[provider].getRelatedCredential) {
    const result = await PROVIDER_STRATEGIES[provider].getRelatedCredential!(
      auth,
      extraConfig,
      workspaceId,
      userId,
      useCase
    );

    if (result) {
      relatedCredential = result.credential;
      extraConfig = result.cleanedConfig;
    }
  }

  const clientId: string | undefined = extraConfig.client_id;

  const metadata: Record<string, string> = {
    use_case: useCase,
    workspace_id: auth.getNonNullableWorkspace().sId,
    user_id: auth.getNonNullableUser().sId,
    ...extraConfig,
  };

  const cRes = await api.createConnection({
    provider,
    metadata,
    relatedCredential,
  });
  if (cRes.isErr()) {
    logger.error({ provider, useCase }, "OAuth: Failed to create connection");
    return new Err({
      code: "connection_creation_failed",
      message: "Failed to create new OAuth connection",
      oAuthAPIError: cRes.error,
    });
  }

  const connection = cRes.value.connection;

  const flags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const forceLabelsScope = flags.includes("force_gdrive_labels_scope");

  return new Ok(
    PROVIDER_STRATEGIES[provider].setupUri({
      connection,
      extraConfig,
      relatedCredential,
      useCase,
      clientId,
      forceLabelsScope,
    })
  );
}

export async function finalizeConnection(
  provider: OAuthProvider,
  query: ParsedUrlQuery
): Promise<Result<OAuthConnectionType, OAuthError>> {
  const code = PROVIDER_STRATEGIES[provider].codeFromQuery(query);

  if (!code) {
    logger.error(
      { provider, step: "code_extraction" },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: authorization code not found in query`,
    });
  }

  const connectionId =
    PROVIDER_STRATEGIES[provider].connectionIdFromQuery(query);

  if (!connectionId) {
    logger.error(
      { provider, step: "connection_extraction" },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: connection not found in query`,
    });
  }

  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const cRes = await api.finalizeConnection({
    provider,
    connectionId,
    code,
    redirectUri: finalizeUriForProvider(provider),
  });

  if (cRes.isErr()) {
    logger.error(
      {
        provider,
        connectionId,
        step: "connection_finalization",
      },
      "OAuth: Failed to finalize connection"
    );

    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: ${cRes.error.message}`,
      oAuthAPIError: cRes.error,
    });
  }

  return new Ok(cRes.value.connection);
}

export async function checkConnectionOwnership(
  auth: Authenticator,
  provider: OAuthProvider,
  connectionId: string
) {
  // Ensure the connectionId has been created by the current user and is not being stolen.
  const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const connectionRes = await oauthAPI.getAccessToken({
    provider,
    connectionId,
  });
  if (
    connectionRes.isErr() ||
    connectionRes.value.connection.metadata.user_id !== auth.user()?.sId
  ) {
    return new Err(new Error("Invalid connection"));
  }

  return new Ok(undefined);
}
