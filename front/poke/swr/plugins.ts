import type { Fetcher } from "swr";

import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { PokeListPluginsForScopeResponseBody } from "@app/pages/api/poke/plugins/";
import type { PokeGetPluginAsyncArgsResponseBody } from "@app/pages/api/poke/plugins/[pluginId]/async-args";
import type { PokeGetPluginDetailsResponseBody } from "@app/pages/api/poke/plugins/[pluginId]/manifest";
import type { PokeRunPluginResponseBody } from "@app/pages/api/poke/plugins/[pluginId]/run";
import type { PokeListPluginRunsResponseBody } from "@app/pages/api/poke/plugins/runs";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { PluginResourceTarget, Result } from "@app/types";
import { Err, Ok } from "@app/types";

export function usePokeListPluginForResourceType({
  disabled,
  pluginResourceTarget,
}: {
  disabled?: boolean;
  pluginResourceTarget: PluginResourceTarget;
}) {
  const workspacesFetcher: Fetcher<PokeListPluginsForScopeResponseBody> =
    fetcher;

  const urlSearchParams = new URLSearchParams({
    resourceType: pluginResourceTarget.resourceType,
  });

  if ("resourceId" in pluginResourceTarget) {
    urlSearchParams.append("resourceId", pluginResourceTarget.resourceId);
    urlSearchParams.append("workspaceId", pluginResourceTarget.workspace.sId);
  }

  const { data, error } = useSWRWithDefaults(
    `/api/poke/plugins?${urlSearchParams.toString()}`,
    workspacesFetcher,
    {
      disabled,
    }
  );

  return {
    plugins: data?.plugins ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
  };
}

export function usePokePluginManifest({
  disabled,
  pluginId,
}: {
  disabled?: boolean;
  pluginId: string;
}) {
  const pluginManifestFetcher: Fetcher<PokeGetPluginDetailsResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/poke/plugins/${pluginId}/manifest`,
    pluginManifestFetcher,
    {
      disabled,
    }
  );

  return {
    manifest: data ? data.manifest : null,
    isLoading: !error && !data && !disabled,
    isError: error,
  };
}

export function usePokePluginAsyncArgs({
  disabled,
  pluginId,
  pluginResourceTarget,
}: {
  disabled?: boolean;
  pluginId: string;
  pluginResourceTarget: PluginResourceTarget;
}) {
  const pluginAsyncArgsFetcher: Fetcher<PokeGetPluginAsyncArgsResponseBody> =
    fetcher;

  const urlSearchParams = new URLSearchParams({
    resourceType: pluginResourceTarget.resourceType,
  });

  if ("resourceId" in pluginResourceTarget) {
    urlSearchParams.append("resourceId", pluginResourceTarget.resourceId);
    urlSearchParams.append("workspaceId", pluginResourceTarget.workspace.sId);
  }

  const { data, error } = useSWRWithDefaults(
    `/api/poke/plugins/${pluginId}/async-args?${urlSearchParams.toString()}`,
    pluginAsyncArgsFetcher,
    {
      disabled,
    }
  );

  return {
    asyncArgs: data ? data.asyncArgs : null,
    isLoading: !error && !data && !disabled,
    isError: error,
  };
}

export function useRunPokePlugin({
  pluginId,
  pluginResourceTarget,
}: {
  pluginId: string;
  pluginResourceTarget: PluginResourceTarget;
}) {
  const urlSearchParams = new URLSearchParams({});

  urlSearchParams.append(
    "resourceType",
    pluginResourceTarget.resourceType ?? "global"
  );

  if ("resourceId" in pluginResourceTarget) {
    urlSearchParams.append("resourceId", pluginResourceTarget.resourceId);
    urlSearchParams.append("workspaceId", pluginResourceTarget.workspace.sId);
  }

  const doRunPlugin = async (
    args: object
  ): Promise<Result<PokeRunPluginResponseBody["result"], string>> => {
    // Check if any of the args are File objects
    const hasFiles = Object.values(args).some((arg) => arg instanceof File);
    let res;
    if (hasFiles) {
      // Use FormData for multipart/form-data when files are present
      const formData = new FormData();
      Object.entries(args).forEach(([key, value]) => {
        formData.append(key, value);
      });

      res = await fetch(
        `/api/poke/plugins/${pluginId}/run?${urlSearchParams.toString()}`,
        {
          method: "POST",
          body: formData,
        }
      );
    } else {
      // Use JSON when no files are present
      res = await fetch(
        `/api/poke/plugins/${pluginId}/run?${urlSearchParams.toString()}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        }
      );
    }

    if (res.ok) {
      const response: PokeRunPluginResponseBody = await res.json();

      return new Ok(response.result);
    } else {
      const errorData = await getErrorFromResponse(res);

      return new Err(errorData.message);
    }
  };

  return { doRunPlugin };
}

export function usePokePluginRuns({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const pluginRunsFetcher: Fetcher<PokeListPluginRunsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/plugins/runs?workspaceId=${owner.sId}`,
    pluginRunsFetcher,
    {
      disabled,
    }
  );

  return {
    data: data?.pluginRuns ?? emptyArray(),
    isError: error,
    isLoading: !error && !data && !disabled,
    mutate,
  };
}
