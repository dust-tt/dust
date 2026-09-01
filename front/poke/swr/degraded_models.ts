import { useSendNotification } from "@app/hooks/useNotification";
import type {
  DegradedModelEndpointStatusType,
  GetDegradedModelsResponseBody,
} from "@app/lib/api/poke/degraded_models";
import { clientFetch } from "@app/lib/egress/client";
import type { DegradedModelEndpointUpdateType } from "@app/lib/model_constructors/types/degradations";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

export function usePokeDegradedModels() {
  const { fetcher } = useFetcher();
  const degradedModelsFetcher: Fetcher<GetDegradedModelsResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    "/api/poke/degraded_models",
    degradedModelsFetcher
  );

  return {
    endpoints: data?.endpoints ?? emptyArray<DegradedModelEndpointStatusType>(),
    isDegradedModelsLoading: !error && !data,
    isDegradedModelsError: error,
    mutateDegradedModels: mutate,
  };
}

export function useUpdatePokeDegradedModels() {
  const sendNotification = useSendNotification();

  return useCallback(
    async (updates: DegradedModelEndpointUpdateType[]): Promise<boolean> => {
      try {
        const res = await clientFetch("/api/poke/degraded_models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoints: updates }),
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

        const degradedCount = updates.filter(({ degraded }) => degraded).length;
        const restoredCount = updates.length - degradedCount;

        sendNotification({
          title: "Degraded models updated",
          description: [
            degradedCount > 0 && `${degradedCount} endpoint(s) degraded.`,
            restoredCount > 0 && `${restoredCount} endpoint(s) restored.`,
          ]
            .filter((part) => typeof part === "string")
            .join(" "),
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
