import useSWR from "swr";
import { useDustAPI } from "./useDustAPI";
import { useCallback } from "react";
import { useAppStateRevalidation, swrConfig } from "../lib/swr";
import type { LightAgentConfigurationType } from "@dust-tt/client";

export function useAgentConfigurations() {
  const dustAPI = useDustAPI();

  const { data, error, isLoading, mutate } = useSWR(
    "agent-configurations",
    async () => {
      const result = await dustAPI.getAgentConfigurations({});
      if (result.isErr()) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    {
      ...swrConfig,
      dedupingInterval: 30000, // Agents don't change often
    }
  );

  const revalidate = useCallback(() => {
    mutate();
  }, [mutate]);

  useAppStateRevalidation(revalidate);

  return {
    agents: (data ?? []) as LightAgentConfigurationType[],
    isLoading,
    error,
  };
}
