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

export function useUpdatePokeKilledModels() {
  const sendNotification = useSendNotification();

  return useCallback(
    async (killedModelIds: string[]): Promise<boolean> => {
      try {
        const res = await clientFetch("/api/poke/kill/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ killedModelIds }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          sendNotification({
            title: "Error updating model kill switches",
            description: errorData.error?.message ?? "Unknown error",
            type: "error",
          });
          return false;
        }

        sendNotification({
          title: "Model kill switches updated",
          description:
            killedModelIds.length === 0
              ? "No model is killed."
              : `${killedModelIds.length} model(s) killed.`,
          type: "success",
        });
        return true;
      } catch (error) {
        sendNotification({
          title: "Error updating model kill switches",
          description: normalizeError(error).message,
          type: "error",
        });
        return false;
      }
    },
    [sendNotification]
  );
}
