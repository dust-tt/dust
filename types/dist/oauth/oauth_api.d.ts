import { ConnectionCredentials, CredentialsProvider, OauthAPIGetCredentialsResponse, OauthAPIPostCredentialsResponse, OAuthConnectionType, OAuthProvider } from "../oauth/lib";
import { LoggerInterface } from "../shared/logger";
import { Result } from "../shared/result";
export type OAuthAPIError = {
    message: string;
    code: string;
};
export type MigratedCredentialsType = {
    redirect_uri: string;
    access_token_expiry?: number;
    authorization_code?: string;
    access_token: string;
    refresh_token?: string;
    raw_json: unknown;
};
export declare function isOAuthAPIError(obj: unknown): obj is OAuthAPIError;
export type OAuthAPIResponse<T> = Result<T, OAuthAPIError>;
export declare class OAuthAPI {
    _logger: LoggerInterface;
    _url: string;
    _apiKey: string | null;
    constructor(config: {
        url: string;
        apiKey: string | null;
    }, logger: LoggerInterface);
    apiUrl(): string;
    createConnection({ provider, metadata, migratedCredentials, relatedCredential, }: {
        provider: OAuthProvider;
        metadata: Record<string, unknown> | null;
        migratedCredentials?: MigratedCredentialsType;
        relatedCredential?: {
            content: Record<string, unknown>;
            metadata: {
                workspace_id: string;
                user_id: string;
            };
        };
    }): Promise<OAuthAPIResponse<{
        connection: OAuthConnectionType;
    }>>;
    finalizeConnection({ provider, connectionId, code, redirectUri, }: {
        provider: OAuthProvider;
        connectionId: string;
        code: string;
        redirectUri: string;
    }): Promise<OAuthAPIResponse<{
        connection: OAuthConnectionType;
    }>>;
    getAccessToken({ provider, connectionId, }: {
        provider: OAuthProvider;
        connectionId: string;
    }): Promise<OAuthAPIResponse<{
        connection: OAuthConnectionType;
        access_token: string;
        access_token_expiry: number | null;
        scrubbed_raw_json: unknown;
    }>>;
    postCredentials({ provider, userId, workspaceId, credentials, }: {
        provider: CredentialsProvider;
        userId: string;
        workspaceId: string;
        credentials: ConnectionCredentials;
    }): Promise<OAuthAPIResponse<OauthAPIPostCredentialsResponse>>;
    getCredentials({ credentialsId, }: {
        credentialsId: string;
    }): Promise<OAuthAPIResponse<OauthAPIGetCredentialsResponse>>;
    private _fetchWithError;
    private _resultFromResponse;
}
//# sourceMappingURL=oauth_api.d.ts.map