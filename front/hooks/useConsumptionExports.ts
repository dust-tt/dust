import { useSendNotification } from "@app/hooks/useNotification";
import type { ConsumptionExportListItem } from "@app/lib/api/analytics/consumption/export_jobs";
import type { ConsumptionExportBody } from "@app/lib/api/analytics/consumption/schema";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

const GENERATING_POLL_INTERVAL_MS = 3_000;

type GetConsumptionExportsResponse = {
  exports: ConsumptionExportListItem[];
  isGenerating: boolean;
};

export function useConsumptionExports({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const url = `/api/w/${workspaceId}/analytics/consumption/export-raw`;
  const exportsFetcher: Fetcher<GetConsumptionExportsResponse> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(url, exportsFetcher, {
    disabled,
    refreshInterval: (latest) =>
      latest?.isGenerating ? GENERATING_POLL_INTERVAL_MS : 0,
  });

  return {
    exports: data?.exports ?? [],
    isGenerating: data?.isGenerating ?? false,
    mutateConsumptionExports: mutate,
    isConsumptionExportsLoading: !error && !data && !disabled,
    isConsumptionExportsError: error,
  };
}

export function useStartConsumptionExport({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();
  const url = `/api/w/${workspaceId}/analytics/consumption/export-raw`;

  const startConsumptionExport = useCallback(
    async (body: ConsumptionExportBody) => {
      setIsStarting(true);
      try {
        const response = await clientFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          sendNotification({
            type: "error",
            title: "Failed to start export",
            description: "Could not start generating the export.",
          });
          return;
        }
        await mutate(url);
      } finally {
        setIsStarting(false);
      }
    },
    [url, sendNotification, mutate]
  );

  return { isStarting, startConsumptionExport };
}
