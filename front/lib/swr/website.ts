import type { Fetcher } from "swr";

import type { RegionType } from "@app/lib/api/regions/config";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetNoWorkspaceAuthContextResponseType } from "@app/pages/api/auth-context";

function getRegionBaseUrl(region: RegionType | null): string {
  if (typeof window === "undefined") {
    return "";
  }

  const isDevelopment =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isDevelopment || !region) {
    return window.location.origin;
  }

  switch (region) {
    case "europe-west1":
      return "https://eu.dust.tt";
    case "us-central1":
      return "https://dust.tt";
    default:
      return window.location.origin;
  }
}

export function useLandingAuthContext({
  hasSessionCookie,
}: {
  hasSessionCookie: boolean;
}) {
  const authContextFetcher: Fetcher<GetNoWorkspaceAuthContextResponseType> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    "/api/auth-context",
    authContextFetcher,
    {
      disabled: !hasSessionCookie,
      shouldRetryOnError: false,
    }
  );

  const isLoading = hasSessionCookie && !error && !data;
  const user = data?.user ?? null;

  // Get the default workspace URL with correct region
  let defaultWorkspaceUrl: string | null = null;
  if (user && user.workspaces.length > 0) {
    const workspace = user.workspaces[0];
    const org = user.organizations?.find((o) => o.externalId === workspace.sId);
    const region = (org?.metadata?.region as RegionType) ?? null;
    const baseUrl = getRegionBaseUrl(region);
    defaultWorkspaceUrl = `${baseUrl}/w/${workspace.sId}`;
  }

  return {
    user,
    defaultWorkspaceUrl,
    isLoading,
    isAuthenticated: !!user,
  };
}
