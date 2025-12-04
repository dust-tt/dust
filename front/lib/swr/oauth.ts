import type { Fetcher } from "swr";

import { clientFetch } from "@app/lib/egress";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetSlackClientIdResponseBody } from "@app/pages/api/w/[wId]/credentials/slack_is_legacy";
import type {
  APIError,
  OAuthConnectionType,
  OAuthProvider,
  Result,
  WithAPIErrorResponse,
} from "@app/types";
import { Err, isAPIErrorResponse, Ok } from "@app/types";

export const useFinalize = () => {
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

    const res = await clientFetch(
      `/api/oauth/${provider}/finalize?${params.toString()}`
    );

    const result: WithAPIErrorResponse<{ connection: OAuthConnectionType }> =
      await res.json();

    if (isAPIErrorResponse(result)) {
      return new Err(result.error);
    }

    if (!res.ok) {
      return new Err({
        type: "internal_server_error",
        message: `Failed to finalize OAuth: ${res.statusText}`,
      });
    }

    return new Ok(result.connection);
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
  const slackIsLegacyFetcher: Fetcher<GetSlackClientIdResponseBody> = fetcher;

  const url = `/api/w/${workspaceId}/credentials/slack_is_legacy${
    credentialId ? `?credentialId=${encodeURIComponent(credentialId)}` : ""
  }`;

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    slackIsLegacyFetcher,
    {
      disabled: disabled ?? !credentialId,
    }
  );

  return {
    isLegacySlackApp: data?.isLegacySlackApp ?? null,
    error,
    isLoading:
      !error && !data && !!credentialId && !(disabled ?? !credentialId),
    mutateIsLegacy: mutate,
  };
}
