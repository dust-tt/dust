import { useSendNotification } from "@app/hooks/useNotification";
import type { ConsumptionExportListItem } from "@app/lib/api/analytics/consumption/export_jobs";
import type { ConsumptionExportBody } from "@app/lib/api/analytics/consumption/schema";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";

const GENERATING_POLL_INTERVAL_MS = 3_000;

type GetConsumptionExportStatusResponse = {
  exports: ConsumptionExportListItem[];
  exportId: string;
  isGenerating: boolean;
  isReady: boolean;
};

// Status is scoped to `exportBody` (period+filter), matching the cache key the export
// workflow itself uses: a workflow running for a different filter must not read as
// "generating" here, and a stale export from a different filter must not read as "ready".
export function useConsumptionExports({
  workspaceId,
  exportBody,
  disabled,
}: {
  workspaceId: string;
  exportBody: ConsumptionExportBody;
  disabled?: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const url = `/api/w/${workspaceId}/analytics/consumption/export-raw/status`;

  const { data, error, mutate } = useSWRWithDefaults<
    [string, ConsumptionExportBody, string],
    GetConsumptionExportStatusResponse
  >([url, exportBody, "POST"], fetcherWithBody, {
    disabled,
    refreshInterval: (latest) =>
      latest?.isGenerating ? GENERATING_POLL_INTERVAL_MS : 0,
  });

  return {
    exports: data?.exports ?? [],
    isGenerating: data?.isGenerating ?? false,
    isReady: data?.isReady ?? false,
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
  const statusUrl = `${url}/status`;

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
        await mutate([statusUrl, body, "POST"]);
      } finally {
        setIsStarting(false);
      }
    },
    [url, statusUrl, sendNotification, mutate]
  );

  return { isStarting, startConsumptionExport };
}
