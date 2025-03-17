import { OAuthConnectionType, OAuthProvider } from "../../oauth/lib";
import { OAuthAPIError } from "../../oauth/oauth_api";
import { LoggerInterface } from "../../shared/logger";
import { Result } from "../../shared/result";
export declare function getOAuthConnectionAccessToken({ config, logger, provider, connectionId, }: {
    config: {
        url: string;
        apiKey: string | null;
    };
    logger: LoggerInterface;
    provider: OAuthProvider;
    connectionId: string;
}): Promise<Result<{
    connection: OAuthConnectionType;
    access_token: string;
    access_token_expiry: number | null;
    scrubbed_raw_json: unknown;
}, OAuthAPIError>>;
//# sourceMappingURL=access_token.d.ts.map