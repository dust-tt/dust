import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDustAppSecretsResponseBody } from "@app/pages/api/w/[wId]/dust_app_secrets";
import type { GetKeysResponseBody } from "@app/pages/api/w/[wId]/keys";
import type { GetProvidersResponseBody } from "@app/pages/api/w/[wId]/providers";
import type { GetAppsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps";
import type { GetRunsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs";
import type { GetRunBlockResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]/blocks/[type]/[name]";
import type { GetRunStatusResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]/status";
import type {
  AppType,
  DustAppSecretType,
  KeyType,
  LightWorkspaceType,
  ProviderType,
  RunRunType,
  RunType,
  SpaceType,
} from "@app/types";

const EMPTY_APPS_ARRAY: AppType[] = [];
const EMPTY_SECRETS_ARRAY: DustAppSecretType[] = [];
const EMPTY_RUNS_ARRAY: RunType[] = [];
const EMPTY_PROVIDERS_ARRAY: ProviderType[] = [];
const EMPTY_KEYS_ARRAY: KeyType[] = [];

export function useApps({
  disabled,
  owner,
  space,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}) {
  const appsFetcher: Fetcher<GetAppsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/spaces/${space.sId}/apps`,
    appsFetcher,
    {
      disabled,
    }
  );

  return {
    apps: data?.apps ?? EMPTY_APPS_ARRAY,
    isAppsLoading: !error && !data,
    isAppsError: !!error,
    mutateApps: mutate,
  };
}

export function useSavedRunStatus(
  owner: LightWorkspaceType,
  app: AppType,
  refresh: (data: GetRunStatusResponseBody | undefined) => number
) {
  const runStatusFetcher: Fetcher<GetRunStatusResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/saved/status`,
    runStatusFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useRunBlock(
  owner: LightWorkspaceType,
  app: AppType,
  runId: string,
  type: string,
  name: string,
  refresh: (data: GetRunBlockResponseBody | undefined) => number
) {
  const runBlockFetcher: Fetcher<GetRunBlockResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/${runId}/blocks/${type}/${name}`,
    runBlockFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useDustAppSecrets(owner: LightWorkspaceType) {
  const keysFetcher: Fetcher<GetDustAppSecretsResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/dust_app_secrets`,
    keysFetcher
  );

  return {
    secrets: data?.secrets ?? EMPTY_SECRETS_ARRAY,
    isSecretsLoading: !error && !data,
    isSecretsError: error,
  };
}

export function useRuns(
  owner: LightWorkspaceType,
  app: AppType,
  limit: number,
  offset: number,
  runType: RunRunType,
  wIdTarget: string | null
) {
  const runsFetcher: Fetcher<GetRunsResponseBody> = fetcher;
  let url = `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs?limit=${limit}&offset=${offset}&runType=${runType}`;
  if (wIdTarget) {
    url += `&wIdTarget=${wIdTarget}`;
  }
  const { data, error } = useSWRWithDefaults(url, runsFetcher);

  return {
    runs: data?.runs ?? EMPTY_RUNS_ARRAY,
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useProviders({
  owner,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const providersFetcher: Fetcher<GetProvidersResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/providers`,
    providersFetcher,
    {
      disabled,
    }
  );

  return {
    providers: data?.providers ?? EMPTY_PROVIDERS_ARRAY,
    isProvidersLoading: !error && !data,
    isProvidersError: error,
  };
}
export function useKeys(owner: LightWorkspaceType) {
  const keysFetcher: Fetcher<GetKeysResponseBody> = fetcher;
  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${owner.sId}/keys`,
    keysFetcher
  );

  return {
    isKeysError: error,
    isKeysLoading: !error && !data,
    isValidating,
    keys: data?.keys ?? EMPTY_KEYS_ARRAY,
  };
}
