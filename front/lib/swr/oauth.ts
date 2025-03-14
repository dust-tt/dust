import type { OAuthProvider } from "@app/types";

export const useFinalize = () => {
  const doFinalize = async (
    provider: OAuthProvider,
    queryParams: Record<string, string | string[] | undefined>
  ) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else if (value !== undefined) {
        params.append(key, value);
      }
    }

    return fetch(`/api/oauth/${provider}/finalize?${params.toString()}`);
  };

  return doFinalize;
};
