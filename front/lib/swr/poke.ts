import { useRegionContextSafe } from "@app/lib/auth/RegionContext";
import { getApiBaseUrl } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { isRegionRedirect } from "@app/lib/swr/workspaces";
import type { GetPokeNoWorkspaceAuthContextResponseType } from "@app/pages/api/poke/auth-context";
import type { GetPokePlansResponseBody } from "@app/pages/api/poke/plans";
import type { GetRegionResponseType } from "@app/pages/api/poke/region";
import type { GetPokeWorkspacesResponseBody } from "@app/pages/api/poke/workspaces";
import type { GetPokeWorkspaceAuthContextResponseType } from "@app/pages/api/poke/workspaces/[wId]/auth-context";
import type { GetPokeFeaturesResponseBody } from "@app/pages/api/poke/workspaces/[wId]/features";
import type { GetDataSourcePermissionsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/permissions";
import type { ConnectorPermission } from "@app/types/connectors/connectors_api";
import type { DataSourceType } from "@app/types/data_source";
import type { APIErrorResponse, RegionRedirectError } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect, useState } from "react";
import type { Fetcher } from "swr";

export function usePokeRegion() {
  const regionFetcher: Fetcher<GetRegionResponseType> = fetcher;

  const { data, error } = useSWRWithDefaults("/api/poke/region", regionFetcher);

  return {
    regionData: data,
    isRegionLoading: !error && !data,
    isRegionError: error,
  };
}

export function usePokeConnectorPermissions({
  owner,
  dataSource,
  parentId,
  filterPermission,
  disabled,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  filterPermission: ConnectorPermission | null;
  disabled?: boolean;
}) {
  const permissionsFetcher: Fetcher<GetDataSourcePermissionsResponseBody> =
    fetcher;

  let url = `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions?viewType=document`;
  if (parentId) {
    url += `&parentId=${parentId}`;
  }
  if (filterPermission) {
    url += `&filterPermission=${filterPermission}`;
  }

  const { data, error } = useSWRWithDefaults(url, permissionsFetcher, {
    disabled,
  });

  return {
    resources: data?.resources ?? emptyArray(),
    isResourcesLoading: !error && !data,
    isResourcesError: error,
  };
}

export function usePokeWorkspaces({
  upgraded,
  search,
  disabled,
  limit,
}: {
  upgraded?: boolean;
  search?: string;
  disabled?: boolean;
  limit?: number;
} = {}) {
  const workspacesFetcher: Fetcher<GetPokeWorkspacesResponseBody> = fetcher;

  const queryParams = [
    upgraded !== undefined ? `upgraded=${upgraded}` : null,
    search ? `search=${search}` : null,
    limit ? `limit=${limit}` : null,
  ].filter((q) => q);

  let query = "";
  if (queryParams.length > 0) {
    query = `?${queryParams.join("&")}`;
  }

  const { data, error } = useSWRWithDefaults(
    `/api/poke/workspaces${query}`,
    workspacesFetcher,
    {
      disabled,
    }
  );

  return {
    workspaces: data?.workspaces ?? emptyArray(),
    isWorkspacesLoading: !error && !data,
    isWorkspacesError: error,
  };
}

export function usePokePlans() {
  const plansFetcher: Fetcher<GetPokePlansResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults("/api/poke/plans", plansFetcher);

  return {
    plans: data?.plans ?? emptyArray(),
    isPlansLoading: !error && !data,
    isPlansError: error,
  };
}

export function usePokeFeatureFlags({
  disabled,
  owner,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const featureFlagsFetcher: Fetcher<GetPokeFeaturesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/features`,
    featureFlagsFetcher,
    { disabled }
  );

  return {
    data: data?.features ?? emptyArray(),
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}

export function usePokeWorkOSDSyncStatus({
  disabled,
  owner,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/dsync`,
    fetcher,
    { disabled }
  );

  return {
    dsyncStatus: data,
    error,
    isLoading: !error && !data,
    mutate,
  };
}

interface UsePokeAuthContextResult<T> {
  authContext: T | undefined;
  isAuthenticated: boolean;
  isAuthContextLoading: boolean;
  authContextError: APIErrorResponse | Error | undefined;
}

export function usePokeAuthContext(options?: {
  disabled?: boolean;
}): UsePokeAuthContextResult<GetPokeNoWorkspaceAuthContextResponseType>;

export function usePokeAuthContext(options: {
  workspaceId: string;
  disabled?: boolean;
}): UsePokeAuthContextResult<
  Exclude<GetPokeWorkspaceAuthContextResponseType, RegionRedirectError>
>;

export function usePokeAuthContext(
  options: { workspaceId?: string; disabled?: boolean } = {}
) {
  const { workspaceId, disabled } = options;
  const [isRedirecting, setIsRedirecting] = useState(false);
  const regionContext = useRegionContextSafe();

  const url = workspaceId
    ? `/api/poke/workspaces/${workspaceId}/auth-context`
    : `/api/poke/auth-context`;

  const { data, isLoading, error, mutate } = useSWRWithDefaults<
    string,
    | GetPokeNoWorkspaceAuthContextResponseType
    | GetPokeWorkspaceAuthContextResponseType
  >(url, fetcher, { disabled });

  const isRegionRedirectResponse = error && isRegionRedirect(error.error);
  const regionRedirect = isRegionRedirectResponse
    ? error.error.redirect
    : undefined;
  const isAuthenticated =
    !isRegionRedirectResponse && !!data?.user && data.isSuperUser;

  // Handle region redirect.
  useEffect(() => {
    if (regionRedirect && regionContext) {
      regionContext.setRegionInfo({
        name: regionRedirect.region,
        url: regionRedirect.url,
      });
      void mutate();
    }
  }, [regionRedirect, mutate, regionContext]);

  // Handle login redirect.
  useEffect(() => {
    if (error && !regionRedirect) {
      if (error.error?.type === "not_authenticated") {
        setIsRedirecting(true);
        window.location.href = `${getApiBaseUrl()}/api/workos/login?returnTo=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`;
      }
      // For all other errors, let the consuming component handle the display.
    }
  }, [error, regionRedirect]);

  return {
    authContext: isRegionRedirectResponse ? undefined : data,
    isAuthenticated,
    isAuthContextLoading:
      isLoading || !!isRegionRedirectResponse || isRedirecting,
    authContextError: error,
  };
}
