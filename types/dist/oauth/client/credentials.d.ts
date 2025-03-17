import { LoggerInterface } from "../../shared/logger";
import { Result } from "../../shared/result";
import { OauthAPIGetCredentialsResponse } from "../lib";
import { OAuthAPIError } from "../oauth_api";
export declare function getConnectionCredentials({ config, logger, credentialsId, }: {
    config: {
        url: string;
        apiKey: string | null;
    };
    logger: LoggerInterface;
    credentialsId: string;
}): Promise<Result<OauthAPIGetCredentialsResponse, OAuthAPIError>>;
//# sourceMappingURL=credentials.d.ts.map