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

    const res = await fetch(
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
