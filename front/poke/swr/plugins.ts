import type { PluginResourceTarget, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { PokeListPluginsForScopeResponseBody } from "@app/pages/api/poke/plugins/";
import type { PokeGetPluginDetailsResponseBody } from "@app/pages/api/poke/plugins/[pluginId]/manifest";
import type { PokeRunPluginResponseBody } from "@app/pages/api/poke/plugins/[pluginId]/run";

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
    plugins: useMemo(() => (data ? data.plugins : []), [data]),
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
    const res = await fetch(
      `/api/poke/plugins/${pluginId}/run?${urlSearchParams.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      }
    );

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
