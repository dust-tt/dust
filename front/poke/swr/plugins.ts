import type { PokeListPluginsForScopeResponseBody } from "@app/lib/api/poke/plugins/list";
import type { PokeRunPluginResponseBody } from "@app/lib/api/poke/plugins/run";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { fetchPokeFromAllCells } from "@app/poke/swr/cells";
import type { PokeListPluginRunsResponseBody } from "@app/types/api/poke/plugin_manager";
import type { PokeGetPluginAsyncArgsResponseBody } from "@app/types/api/poke/plugins/async_args";
import type { PokeGetPluginDetailsResponseBody } from "@app/types/api/poke/plugins/manifest";
import type { CellInfo } from "@app/types/cell";
import type { PluginResourceTarget } from "@app/types/poke/plugins";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Fetcher } from "swr";

export function usePokeListPluginForResourceType({
  disabled,
  pluginResourceTarget,
}: {
  disabled?: boolean;
  pluginResourceTarget: PluginResourceTarget;
}) {
  const { fetcher } = useFetcher();
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
  const { fetcher } = useFetcher();
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
  const { fetcher } = useFetcher();
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

export interface CellPluginRunResult {
  cell: CellInfo;
  result: Result<PokeRunPluginResponseBody["result"], string>;
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

  // Args carrying a File must go over FormData; otherwise JSON keeps the
  // request body typed for the API route.
  const buildRunRequestInit = (args: object): RequestInit => {
    const hasFiles = Object.values(args).some((arg) => arg instanceof File);
    if (hasFiles) {
      const formData = new FormData();
      Object.entries(args).forEach(([key, value]) => {
        formData.append(key, value);
      });

      return { method: "POST", credentials: "include", body: formData };
    }

    return {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    };
  };

  const runPath = `/api/poke/plugins/${pluginId}/run?${urlSearchParams.toString()}`;

  // An absolute base URL bypasses the selected-cell URL rewrite, which is
  // how a run gets targeted at a specific cell.
  const runPlugin = async (
    args: object,
    baseUrl = ""
  ): Promise<Result<PokeRunPluginResponseBody["result"], string>> => {
    const res = await clientFetch(
      `${baseUrl}${runPath}`,
      buildRunRequestInit(args)
    );

    if (res.ok) {
      const response: PokeRunPluginResponseBody = await res.json();

      return new Ok(response.result);
    } else {
      const errorData = await getErrorFromResponse(res);

      return new Err(errorData.message);
    }
  };

  const doRunPlugin = (args: object) => runPlugin(args);

  const doRunPluginOnCells = async (
    args: object,
    cells: CellInfo[]
  ): Promise<CellPluginRunResult[]> => {
    const results = await fetchPokeFromAllCells<PokeRunPluginResponseBody>({
      cells,
      path: runPath,
      init: buildRunRequestInit(args),
    });

    return results.map((result) =>
      result.ok
        ? { cell: result.cell, result: new Ok(result.data.result) }
        : {
            cell: result.cell,
            result: new Err(normalizeError(result.error).message),
          }
    );
  };

  return { doRunPlugin, doRunPluginOnCells };
}

interface PokePluginRunsFetchProps {
  disabled?: boolean;
  owner?: { sId: string }; // Optional for global plugins
  resourceType?: string;
  resourceId?: string;
}

export function usePokePluginRuns({
  disabled,
  owner,
  resourceType,
  resourceId,
}: PokePluginRunsFetchProps) {
  const { fetcher } = useFetcher();
  const pluginRunsFetcher: Fetcher<PokeListPluginRunsResponseBody> = fetcher;

  const urlParams = new URLSearchParams();

  // Add workspaceId only if owner is provided (workspace/resource level)
  if (owner) {
    urlParams.append("workspaceId", owner.sId);
  }

  if (resourceType) {
    urlParams.append("resourceType", resourceType);
  }
  if (resourceId) {
    urlParams.append("resourceId", resourceId);
  }

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/plugins/runs?${urlParams.toString()}`,
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
