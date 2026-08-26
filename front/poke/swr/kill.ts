import { useSendNotification } from "@app/hooks/useNotification";
import type { GetKillSwitchesResponseBody } from "@app/lib/api/poke/kill";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

export function usePokeKillSwitches() {
  const { fetcher } = useFetcher();
  const killSwitchesFetcher: Fetcher<GetKillSwitchesResponseBody> = fetcher;

  const { data, error, mutate } = useSWR("/api/poke/kill", killSwitchesFetcher);

  return {
    killSwitches: data?.killSwitches ?? emptyArray(),
    isKillSwitchesLoading: !error && !data,
    isKillSwitchesError: error,
    mutateKillSwitches: mutate,
  };
}

export function useUpdatePokeDegradedModels() {
  const sendNotification = useSendNotification();

  return useCallback(
    async (degradedModelIds: string[]): Promise<boolean> => {
      try {
        const res = await clientFetch("/api/poke/kill/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ degradedModelIds }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          sendNotification({
            title: "Error updating degraded models",
            description: errorData.error?.message ?? "Unknown error",
            type: "error",
          });
          return false;
        }

        sendNotification({
          title: "Degraded models updated",
          description:
            degradedModelIds.length === 0
              ? "No model is degraded."
              : `${degradedModelIds.length} model(s) degraded.`,
          type: "success",
        });
        return true;
      } catch (error) {
        sendNotification({
          title: "Error updating degraded models",
          description: normalizeError(error).message,
          type: "error",
        });
        return false;
      }
    },
    [sendNotification]
  );
}
