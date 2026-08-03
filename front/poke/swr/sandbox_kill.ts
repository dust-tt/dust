import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import type { SandboxKillRequestResponseBody } from "@app/types/api/poke/types";
import type { SandboxKillImagesResponseBody } from "@app/types/api/sandbox/image";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

export function usePokeSandboxKillImages() {
  const { fetcher } = useFetcher();
  const imagesFetcher: Fetcher<SandboxKillImagesResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    "/api/poke/sandbox_kill/images",
    imagesFetcher
  );

  return {
    images: data?.images ?? emptyArray(),
    isImagesLoading: !error && !data,
    isImagesError: error,
    mutateImages: mutate,
  };
}

export function useRequestSandboxKill() {
  const sendNotification = useSendNotification();

  return useCallback(
    async ({
      baseImage,
      version,
    }: {
      baseImage: string;
      version?: string;
    }): Promise<void> => {
      try {
        const res = await clientFetch("/api/poke/sandbox_kill/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseImage, version }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          sendNotification({
            title: "Failed to request sandbox kill",
            description: errorData.error?.message ?? "Unknown error",
            type: "error",
          });
          return;
        }

        const body: SandboxKillRequestResponseBody = await res.json();
        window.open(body.temporalLink, "_blank", "noopener,noreferrer");
        sendNotification({
          title: "Sandbox kill requested",
          description: `Workflow ${body.workflowId} started. Opened Temporal in a new tab.`,
          type: "success",
        });
      } catch (error) {
        sendNotification({
          title: "Failed to request sandbox kill",
          description: normalizeError(error).message,
          type: "error",
        });
      }
    },
    [sendNotification]
  );
}
