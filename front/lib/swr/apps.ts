import type { Fetcher } from "swr";

import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import logger from "@app/logger/logger";
import type { GetDustAppSecretsResponseBody } from "@app/pages/api/w/[wId]/dust_app_secrets";
import type { GetKeysResponseBody } from "@app/pages/api/w/[wId]/keys";
import type { GetProvidersResponseBody } from "@app/pages/api/w/[wId]/providers";
import type { GetAppsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps";
import type { GetOrPostAppResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]";
import type { GetRunsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs";
import type { GetRunResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]";
import type { GetRunBlockResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]/blocks/[type]/[name]";
import type { PostRunCancelResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]/cancel";
import type { GetRunStatusResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/runs/[runId]/status";
import type { AppType } from "@app/types/app";
import type { RunRunType } from "@app/types/run";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";

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

export function useApp({
  workspaceId,
  spaceId,
  appId,
  disabled,
}: {
  workspaceId: string;
  spaceId: string;
  appId: string;
  disabled?: boolean;
}) {
  const appFetcher: Fetcher<GetOrPostAppResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${spaceId}/apps/${appId}`,
    appFetcher,
    {
      disabled,
    }
  );

  return {
    app: data?.app ?? null,
    isAppLoading: !error && !data && !disabled,
    isAppError: !!error,
    mutateApp: mutate,
  };
}

export function useSavedRunStatus(
  owner: LightWorkspaceType,
  app: AppType | null,
  refresh: (data: GetRunStatusResponseBody | undefined) => number
) {
  const runStatusFetcher: Fetcher<GetRunStatusResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    app
      ? `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs/saved/status`
      : null,
    runStatusFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !!app && !error && !data,
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

export function useDustAppSecrets(owner: LightWorkspaceType | null) {
  const keysFetcher: Fetcher<GetDustAppSecretsResponseBody> = fetcher;
  const { data, error } = useSWRWithDefaults(
    owner ? `/api/w/${owner.sId}/dust_app_secrets` : null,
    keysFetcher
  );

  return {
    secrets: data?.secrets ?? emptyArray(),
    isSecretsLoading: !error && !data && !!owner,
    isSecretsError: error,
  };
}

export function useRuns(
  owner: LightWorkspaceType,
  app: AppType | null,
  limit: number,
  offset: number,
  runType: RunRunType,
  wIdTarget: string | null
) {
  const runsFetcher: Fetcher<GetRunsResponseBody> = fetcher;
  const disabled = !app;
  let url: string | null = null;
  if (app) {
    url = `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/runs?limit=${limit}&offset=${offset}&runType=${runType}`;
    if (wIdTarget) {
      url += `&wIdTarget=${wIdTarget}`;
    }
  }
  const { data, error } = useSWRWithDefaults(url, runsFetcher, { disabled });

  return {
    runs: data?.runs ?? emptyArray(),
    total: data ? data.total : 0,
    isRunsLoading: !disabled && !error && !data,
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
  app: AppType | null;
}) {
  const doCancel = async (runId: string): Promise<boolean> => {
    if (!app) {
      return false;
    }

    try {
      const res = await clientFetch(
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

export function useRunWithSpec({
  workspaceId,
  spaceId,
  appId,
  runId,
  disabled,
}: {
  workspaceId: string;
  spaceId: string;
  appId: string;
  runId: string;
  disabled?: boolean;
}) {
  const runFetcher: Fetcher<GetRunResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${spaceId}/apps/${appId}/runs/${runId}`,
    runFetcher,
    { disabled }
  );

  return {
    run: data?.run ?? null,
    spec: data?.spec ?? null,
    isRunLoading: !error && !data && !disabled,
    isRunError: !!error,
  };
}
