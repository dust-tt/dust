import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetSlackClientIdResponseBody } from "@app/pages/api/w/[wId]/credentials/slack_is_legacy";
import type { GetOAuthSetupResponseBody } from "@app/pages/api/w/[wId]/oauth/[provider]/setup";
import type { APIError } from "@app/types/error";
import { isAPIErrorResponse } from "@app/types/error";
import type {
  OAuthConnectionType,
  OAuthCredentials,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Fetcher } from "swr";

export const useFinalize = () => {
  const { fetcher } = useFetcher();

  const doFinalize = async (
    provider: OAuthProvider,
    queryParams: Record<string, string | string[] | undefined>
  ): Promise<Result<OAuthConnectionType, APIError>> => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else if (value !== undefined) {
        params.append(key, value);
      }
    }

    try {
      const result: { connection: OAuthConnectionType } = await fetcher(
        `/api/oauth/${provider}/finalize?${params.toString()}`
      );

      return new Ok(result.connection);
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        return new Err(e.error);
      }
      return new Err({
        type: "internal_server_error",
        message: "Failed to finalize OAuth",
      });
    }
  };

  return doFinalize;
};

export function useSlackIsLegacy({
  workspaceId,
  credentialId,
  disabled,
}: {
  workspaceId: string;
  credentialId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const slackIsLegacyFetcher: Fetcher<GetSlackClientIdResponseBody> = fetcher;

  const url = `/api/w/${workspaceId}/credentials/slack_is_legacy${
    credentialId ? `?credentialId=${encodeURIComponent(credentialId)}` : ""
  }`;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    url,
    slackIsLegacyFetcher,
    {
      disabled: disabled ?? !credentialId,
    }
  );

  return {
    isLegacySlackApp: data?.isLegacySlackApp ?? false,
    isError: !!error,
    isLoading,
    mutateIsLegacy: mutate,
  };
}

export function useOAuthSetup({
  workspaceId,
  provider,
  useCase,
  extraConfig,
  openerOrigin,
  disabled,
}: {
  workspaceId: string;
  provider: OAuthProvider;
  useCase: OAuthUseCase;
  extraConfig?: OAuthCredentials;
  openerOrigin?: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const oauthSetupFetcher: Fetcher<GetOAuthSetupResponseBody> = fetcher;

  let url = `/api/w/${workspaceId}/oauth/${provider}/setup?useCase=${useCase}`;
  if (extraConfig) {
    url += `&extraConfig=${encodeURIComponent(JSON.stringify(extraConfig))}`;
  }
  if (openerOrigin) {
    url += `&openerOrigin=${encodeURIComponent(openerOrigin)}`;
  }

  const { data, error, isLoading } = useSWRWithDefaults(
    url,
    oauthSetupFetcher,
    {
      disabled,
    }
  );

  return {
    redirectUrl: data?.redirectUrl,
    isOAuthSetupLoading: isLoading && !disabled,
    isOAuthSetupError: error,
  };
}
