import { fetcher, useSWRWithDefaults } from "@app/extension/app/src/lib/swr";
import type {
  AgentsGetViewType,
  LightAgentConfigurationType,
} from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function usePublicAgentConfigurations({
  workspaceId,
  agentsGetView,
  includes = [],
  limit,
  sort,
  disabled,
}: {
  workspaceId: string;
  agentsGetView: AgentsGetViewType | null;
  includes?: ("authors" | "usage")[];
  limit?: number;
  sort?: "alphabetical" | "priority";
  disabled?: boolean;
}) {
  const agentConfigurationsFetcher: Fetcher<{
    agentConfigurations: LightAgentConfigurationType[];
  }> = fetcher;

  // Function to generate query parameters.
  function getQueryString() {
    const params = new URLSearchParams();
    if (typeof agentsGetView === "string") {
      params.append("view", agentsGetView);
    }
    if (includes.includes("usage")) {
      params.append("withUsage", "true");
    }
    if (includes.includes("authors")) {
      params.append("withAuthors", "true");
    }

    if (limit) {
      params.append("limit", limit.toString());
    }

    if (sort) {
      params.append("sort", sort);
    }

    return params.toString();
  }

  const queryString = getQueryString();

  const key = `/api/v1/w/${workspaceId}/assistant/agent_configurations?${queryString}`;

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(agentsGetView ? key : null, agentConfigurationsFetcher, {
      disabled,
    });

  return {
    agentConfigurations: useMemo(
      () => (data ? data.agentConfigurations : []),
      [data]
    ),
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
