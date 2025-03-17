import { LightWorkspaceType } from "../../front/user";
import { OAuthConnectionType, OAuthProvider, OAuthUseCase } from "../../oauth/lib";
import { Result } from "../../shared/result";
export declare function setupOAuthConnection({ dustClientFacingUrl, owner, provider, useCase, extraConfig, }: {
    dustClientFacingUrl: string;
    owner: LightWorkspaceType;
    provider: OAuthProvider;
    useCase: OAuthUseCase;
    extraConfig: Record<string, string>;
}): Promise<Result<OAuthConnectionType, Error>>;
//# sourceMappingURL=setup.d.ts.map