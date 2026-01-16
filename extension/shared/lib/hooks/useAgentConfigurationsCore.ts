import type {
  AgentConfigurationViewType,
  DustAPI,
  LightAgentConfigurationType,
} from "@dust-tt/client";
import { useMemo } from "react";

import { createAgentConfigurationsFetcher } from "@app/shared/lib/fetchers";
import type { AgentConfigurationsKey } from "@app/shared/lib/hook-types";
import { compareAgentsForSort } from "@app/shared/lib/utils";

/**
 * Core logic for useAgentConfigurations hook.
 * Returns the SWR key and fetcher function for agent configurations.
 * The actual SWR call must be made in platform-specific code to avoid
 * React context mismatches between different SWR package instances.
 */
export function useAgentConfigurationsCore(
  dustAPI: DustAPI | null,
  view?: AgentConfigurationViewType,
  includes?: "authors"[]
) {
  const swrKey: AgentConfigurationsKey = dustAPI
    ? ["getAgentConfigurations", dustAPI.workspaceId(), view]
    : null;

  const fetcher = useMemo(
    () => createAgentConfigurationsFetcher(dustAPI, view, includes),
    [dustAPI, view, includes]
  );

  return { swrKey, fetcher };
}

/**
 * Transforms raw agent configurations by filtering to active agents
 * and sorting using the standard agent sort order.
 */
export function transformAgentConfigurations(
  data: LightAgentConfigurationType[] | undefined
): LightAgentConfigurationType[] {
  if (!data) {
    return [];
  }
  return data.filter((a) => a.status === "active").sort(compareAgentsForSort);
}
