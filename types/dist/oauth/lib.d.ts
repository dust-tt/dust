import * as t from "io-ts";
export declare const OAUTH_USE_CASES: readonly ["connection", "labs_transcripts", "platform_actions"];
export type OAuthUseCase = (typeof OAUTH_USE_CASES)[number];
export declare function isOAuthUseCase(obj: unknown): obj is OAuthUseCase;
export declare const OAUTH_PROVIDERS: readonly ["confluence", "github", "google_drive", "intercom", "notion", "slack", "gong", "microsoft", "zendesk", "salesforce"];
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export declare function isOAuthProvider(obj: unknown): obj is OAuthProvider;
export type OAuthConnectionType = {
    connection_id: string;
    created: number;
    metadata: Record<string, unknown>;
    provider: OAuthProvider;
    status: "pending" | "finalized";
};
export declare function isOAuthConnectionType(obj: unknown): obj is OAuthConnectionType;
export declare function isValidZendeskSubdomain(s: unknown): s is string;
export declare function isValidSalesforceDomain(s: unknown): s is string;
export declare function isValidSalesforceClientId(s: unknown): s is string;
export declare function isValidSalesforceClientSecret(s: unknown): s is string;
export declare const PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS: readonly ["gong", "modjo"];
export type ProvidersWithWorkspaceConfigurations = (typeof PROVIDERS_WITH_WORKSPACE_CONFIGURATIONS)[number];
export declare const CREDENTIALS_PROVIDERS: readonly ["snowflake", "modjo", "bigquery", "salesforce"];
export type CredentialsProvider = (typeof CREDENTIALS_PROVIDERS)[number];
export declare function isCredentialProvider(obj: unknown): obj is CredentialsProvider;
export declare function isProviderWithWorkspaceConfiguration(obj: unknown): obj is ProvidersWithWorkspaceConfigurations;
export declare const SnowflakeCredentialsSchema: t.TypeC<{
    username: t.StringC;
    password: t.StringC;
    account: t.StringC;
    role: t.StringC;
    warehouse: t.StringC;
}>;
export type SnowflakeCredentials = t.TypeOf<typeof SnowflakeCredentialsSchema>;
export declare const CheckBigQueryCredentialsSchema: t.TypeC<{
    type: t.StringC;
    project_id: t.StringC;
    private_key_id: t.StringC;
    private_key: t.StringC;
    client_email: t.StringC;
    client_id: t.StringC;
    auth_uri: t.StringC;
    token_uri: t.StringC;
    auth_provider_x509_cert_url: t.StringC;
    client_x509_cert_url: t.StringC;
    universe_domain: t.StringC;
}>;
export type CheckBigQueryCredentials = t.TypeOf<typeof CheckBigQueryCredentialsSchema>;
export declare const BigQueryCredentialsWithLocationSchema: t.TypeC<{
    type: t.StringC;
    project_id: t.StringC;
    private_key_id: t.StringC;
    private_key: t.StringC;
    client_email: t.StringC;
    client_id: t.StringC;
    auth_uri: t.StringC;
    token_uri: t.StringC;
    auth_provider_x509_cert_url: t.StringC;
    client_x509_cert_url: t.StringC;
    universe_domain: t.StringC;
    location: t.StringC;
}>;
export type BigQueryCredentialsWithLocation = t.TypeOf<typeof BigQueryCredentialsWithLocationSchema>;
export declare const ApiKeyCredentialsSchema: t.TypeC<{
    api_key: t.StringC;
}>;
export type ModjoCredentials = t.TypeOf<typeof ApiKeyCredentialsSchema>;
export declare const SalesforceCredentialsSchema: t.TypeC<{
    client_id: t.StringC;
    client_secret: t.StringC;
}>;
export type SalesforceCredentials = t.TypeOf<typeof SalesforceCredentialsSchema>;
export type ConnectionCredentials = SnowflakeCredentials | ModjoCredentials | BigQueryCredentialsWithLocation | SalesforceCredentials;
export declare function isSnowflakeCredentials(credentials: ConnectionCredentials): credentials is SnowflakeCredentials;
export declare function isModjoCredentials(credentials: ConnectionCredentials): credentials is ModjoCredentials;
export declare function isBigQueryWithLocationCredentials(credentials: ConnectionCredentials): credentials is BigQueryCredentialsWithLocation;
export declare function isSalesforceCredentials(credentials: ConnectionCredentials): credentials is SalesforceCredentials;
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
//# sourceMappingURL=lib.d.ts.map