import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import logger from "@app/logger/logger";
import type { GetDustAppSecretsResponseBody } from "@app/pages/api/w/[wId]/dust_app_secrets";
import type { GetKeysResponseBody } from "@app/pages/api/w/[wId]/keys";
import type { GetProvidersResponseBody } from "@app/pages/api/w/[wId]/providers";
import type { GetAppsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps";
import type { GetRunsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs";
import type { GetRunBlockResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]/blocks/[type]/[name]";
import type { PostRunCancelResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]/cancel";
import type { GetRunStatusResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]/status";
import type {
  AppType,
  LightWorkspaceType,
  RunRunType,
  SpaceType,
} from "@app/types";

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
    apps: data?.apps ?? emptyArray(),
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
    secrets: data?.secrets ?? emptyArray(),
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
    runs: data?.runs ?? emptyArray(),
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
    providers: data?.providers ?? emptyArray(),
    isProvidersLoading: !error && !data,
    isProvidersError: error,
  };
}

export function useKeys(owner: LightWorkspaceType) {
  const keysFetcher: Fetcher<GetKeysResponseBody> = fetcher;
  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${owner.sId}/keys`,
    keysFetcher,
    {
      revalidateOnFocus: false,
    }
  );

  return {
    isKeysError: error,
    isKeysLoading: !error && !data,
    isValidating,
    keys: data?.keys ?? emptyArray(),
  };
}

export function useCancelRun({
  owner,
  app,
}: {
  owner: LightWorkspaceType;
  app: AppType;
}) {
  const doCancel = async (runId: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/${runId}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        logger.error({ err: await res.text() }, "Failed to cancel run");
        return false;
      }

      const data: PostRunCancelResponseBody = await res.json();
      return data.success;
    } catch (error) {
      logger.error({ err: error }, "Error canceling run");
      return false;
    }
  };

  return { doCancel };
}
