import { useState } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, fetcher } from "@app/lib/swr/swr";
import type { GetProductionChecksResponseBody } from "@app/pages/api/poke/production-checks";
import type { GetCheckHistoryResponseBody } from "@app/pages/api/poke/production-checks/[checkName]/history";

const REFRESH_INTERVAL_MS = 30000;
const REFETCH_DELAY_MS = 2000;

export function usePokeProductionChecks() {
  const productionChecksFetcher: Fetcher<GetProductionChecksResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWR(
    "/api/poke/production-checks",
    productionChecksFetcher,
    { refreshInterval: REFRESH_INTERVAL_MS }
  );

  return {
    checks: data?.checks ?? emptyArray(),
    isProductionChecksLoading: !error && !data,
    isProductionChecksError: error,
    mutateProductionChecks: mutate,
  };
}

export function usePokeCheckHistory(checkName: string, enabled: boolean) {
  const checkHistoryFetcher: Fetcher<GetCheckHistoryResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    enabled
      ? `/api/poke/production-checks/${encodeURIComponent(checkName)}/history`
      : null,
    checkHistoryFetcher
  );

  return {
    runs: data?.runs ?? emptyArray(),
    isCheckHistoryLoading: enabled && !error && !data,
    isCheckHistoryError: error,
    mutateCheckHistory: mutate,
  };
}

export function useRunProductionCheck() {
  const sendNotification = useSendNotification();
  const { mutateProductionChecks } = usePokeProductionChecks();
  const [runningChecks, setRunningChecks] = useState<Set<string>>(new Set());

  const runCheck = async (checkName: string) => {
    setRunningChecks((prev) => new Set(prev).add(checkName));

    try {
      const res = await clientFetch("/api/poke/production-checks/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkName }),
      });

      if (res.ok) {
        sendNotification({
          title: "Check started",
          description: `${checkName} has been triggered`,
          type: "success",
        });
        setTimeout(() => {
          void mutateProductionChecks();
        }, REFETCH_DELAY_MS);
      } else {
        const errorData = await res.json();
        sendNotification({
          title: "Failed to start check",
          description: errorData.error?.message ?? "Unknown error",
          type: "error",
        });
      }
    } catch (err) {
      console.error(err);
      sendNotification({
        title: "Failed to start check",
        description: "Network error",
        type: "error",
      });
    } finally {
      setRunningChecks((prev) => {
        const next = new Set(prev);
        next.delete(checkName);
        return next;
      });
    }
  };

  const isCheckRunning = (checkName: string) => runningChecks.has(checkName);

  return {
    runCheck,
    isCheckRunning,
  };
}
