import type {
  LightWorkspaceType,
  PluginWorkspaceResource,
  Result,
} from "@dust-tt/types";
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
  resourceType,
}: {
  disabled?: boolean;
  resourceType: string;
}) {
  const workspacesFetcher: Fetcher<PokeListPluginsForScopeResponseBody> =
    fetcher;

  const urlSearchParams = new URLSearchParams({
    resourceType,
  });

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
  workspaceResource,
}: {
  disabled?: boolean;
  pluginId: string;
  workspaceResource?: PluginWorkspaceResource;
}) {
  const pluginManifestFetcher: Fetcher<PokeGetPluginDetailsResponseBody> =
    fetcher;

  const urlSearchParams = new URLSearchParams({});

  if (workspaceResource) {
    urlSearchParams.append("resourceId", workspaceResource.resourceId);
    urlSearchParams.append("workspaceId", workspaceResource.workspace.sId);
  }

  const { data, error } = useSWRWithDefaults(
    `/api/poke/plugins/${pluginId}/manifest?${urlSearchParams.toString()}`,
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
  workspaceResource,
}: {
  pluginId: string;
  workspaceResource?: PluginWorkspaceResource;
}) {
  const urlSearchParams = new URLSearchParams({});

  if (workspaceResource) {
    urlSearchParams.append("resourceId", workspaceResource.resourceId);
    urlSearchParams.append("workspaceId", workspaceResource.workspace.sId);
  }

  const doRunPlugin = async (args: object): Promise<Result<string, string>> => {
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
