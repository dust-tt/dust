import { useSendNotification } from "@app/hooks/useNotification";
import { useCellContext } from "@app/lib/auth/CellContext";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import { fetchPokeFromAllCells } from "@app/poke/swr/cells";
import type {
  GetCheckHistoryResponseBody,
  GetProductionChecksResponseBody,
} from "@app/types/api/poke/production_checks";
import type { CellType } from "@app/types/cell";
import type {
  CheckHistoryRun,
  CheckSummary,
} from "@app/types/production_checks";
import type { RegionType } from "@app/types/region";
import { useCallback, useEffect, useState } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

const REFRESH_INTERVAL_MS = 30000;
const REFETCH_DELAY_MS = 2000;

export interface ProductionChecksForCell {
  cell: CellType;
  region: RegionType;
  url: string;
  checks: CheckSummary[];
  alertCount: number;
  isError: boolean;
}

export function usePokeProductionChecksAllCells() {
  const { cells } = useCellContext();
  const [checksByCell, setChecksByCell] = useState<ProductionChecksForCell[]>(
    emptyArray()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutateProductionChecks = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional refetch trigger via mutateProductionChecks()
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const run = async (showLoading: boolean) => {
      if (showLoading) {
        setIsLoading(true);
      }

      const settled =
        await fetchPokeFromAllCells<GetProductionChecksResponseBody>({
          cells,
          path: "/api/poke/production-checks",
        });

      const byCell: ProductionChecksForCell[] = [];
      let hasErrors = false;

      for (const result of settled) {
        if (!result.ok) {
          hasErrors = true;
          byCell.push({
            cell: result.cell.name,
            region: result.cell.region,
            url: result.cell.url,
            checks: [],
            alertCount: 0,
            isError: true,
          });
          continue;
        }

        const checks = result.data.checks;
        byCell.push({
          cell: result.cell.name,
          region: result.cell.region,
          url: result.cell.url,
          checks,
          alertCount: checks.filter((check) => check.status === "alert").length,
          isError: false,
        });
      }

      byCell.sort(
        (a, b) =>
          cells.findIndex((cell) => cell.name === a.cell) -
          cells.findIndex((cell) => cell.name === b.cell)
      );

      if (!cancelled) {
        setChecksByCell(byCell);
        setIsError(hasErrors);
        setIsLoading(false);
      }
    };

    void run(true);
    intervalId = setInterval(() => {
      void run(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [cells, refreshKey]);

  return {
    checksByCell,
    isProductionChecksLoading: isLoading,
    isProductionChecksError: isError,
    mutateProductionChecks,
  };
}

export function usePokeCheckHistoryForCell(
  cellUrl: string | null,
  checkName: string,
  enabled: boolean
) {
  const { fetcher } = useFetcher();
  const checkHistoryFetcher: Fetcher<GetCheckHistoryResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    enabled && cellUrl
      ? `${cellUrl}/api/poke/production-checks/${encodeURIComponent(checkName)}/history`
      : null,
    checkHistoryFetcher
  );

  return {
    runs: (data?.runs ?? emptyArray()) as CheckHistoryRun[],
    isCheckHistoryLoading: enabled && !error && !data,
    isCheckHistoryError: error,
    mutateCheckHistory: mutate,
  };
}

export function useRunProductionCheckForCell(
  mutateProductionChecks: () => void
) {
  const sendNotification = useSendNotification();
  const [runningChecks, setRunningChecks] = useState<Set<string>>(new Set());

  const runCheck = async (
    cellUrl: string,
    cell: CellType,
    checkName: string
  ) => {
    const runKey = `${cell}:${checkName}`;
    setRunningChecks((prev) => new Set(prev).add(runKey));

    try {
      const res = await clientFetch(
        `${cellUrl}/api/poke/production-checks/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkName }),
        }
      );

      if (res.ok) {
        sendNotification({
          title: "Check started",
          description: `${checkName} has been triggered on ${cell}`,
          type: "success",
        });
        setTimeout(() => {
          mutateProductionChecks();
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
        next.delete(runKey);
        return next;
      });
    }
  };

  const isCheckRunning = (cell: CellType, checkName: string) =>
    runningChecks.has(`${cell}:${checkName}`);

  return {
    runCheck,
    isCheckRunning,
  };
}
