import type { Fetcher } from "swr";

import type { RegionType } from "@app/lib/api/regions/config";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetNoWorkspaceAuthContextResponseType } from "@app/pages/api/auth-context";

export interface WorkspaceWithRegion {
  sId: string;
  name: string;
  region: RegionType | null;
  url: string;
}

/**
 * Get the base URL for a given region.
 * Falls back to current origin for unknown regions or development.
 */
function getRegionBaseUrl(region: RegionType | null): string {
  if (typeof window === "undefined") {
    return "";
  }

  // In development or for unknown regions, use current origin
  const isDevelopment =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isDevelopment || !region) {
    return window.location.origin;
  }

  // Production region URLs
  switch (region) {
    case "europe-west1":
      return "https://eu.dust.tt";
    case "us-central1":
      return "https://dust.tt";
    default:
      return window.location.origin;
  }
}

/**
 * Hook to fetch auth context for the landing page.
 *
 * Unlike useAuthContext from workspaces.ts, this hook:
 * - Does NOT redirect to login if unauthenticated
 * - Is designed for public pages that may show different UI for logged-in users
 * - Only fetches when hasSessionCookie is true to avoid unnecessary API calls
 */
export function useLandingPageAuthContext({
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
      // Don't retry on auth errors - user is simply not logged in
      shouldRetryOnError: false,
    }
  );

  const isLoading = hasSessionCookie && !error && !data;
  const isAuthenticated = !!data?.user;

  // Build workspaces with region info from organizations
  const workspacesWithRegion: WorkspaceWithRegion[] = [];
  if (data?.user) {
    const orgByExternalId = new Map<string, { region: RegionType | null }>();
    for (const org of data.user.organizations ?? []) {
      if (org.externalId) {
        const region = (org.metadata?.region as RegionType) ?? null;
        orgByExternalId.set(org.externalId, { region });
      }
    }

    for (const workspace of data.user.workspaces) {
      const orgInfo = orgByExternalId.get(workspace.sId);
      const region = orgInfo?.region ?? null;
      const baseUrl = getRegionBaseUrl(region);
      workspacesWithRegion.push({
        sId: workspace.sId,
        name: workspace.name,
        region,
        url: `${baseUrl}/w/${workspace.sId}`,
      });
    }
  }

  return {
    user: data?.user ?? null,
    defaultWorkspaceId: data?.defaultWorkspaceId ?? null,
    workspaces: workspacesWithRegion,
    isAuthenticated,
    isLoading,
    isError: !!error,
  };
}
