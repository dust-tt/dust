import { useCellContext } from "@app/lib/auth/CellContext";
import { emptyArray } from "@app/lib/swr/swr";
import { fetchPokeFromAllCells } from "@app/poke/swr/cells";
import type {
  GetPokePlansResponseBody,
  PokePlanWithUsage,
} from "@app/types/api/poke/plans";
import type { CellType } from "@app/types/cell";
import type { RegionType } from "@app/types/region";
import { useCallback, useEffect, useState } from "react";

export interface PokePlanCellUsage {
  cell: CellType;
  region: RegionType;
  // `null` when the plan code is not present in that cell's plan table at all, which reads
  // differently from a plan that exists there with no subscriber.
  workspaceCount: number | null;
}

/**
 * Per-cell subscriber counts for a single plan code, plus the plan itself.
 *
 * Poke's plan table is per-cell: `/api/poke/plans` returns the plans of whichever cell served
 * the request, each annotated with that cell's subscriber count. Fanning the list out to every
 * cell therefore gives both the fleet-wide counts and the plan's own definition in one round of
 * requests, without a dedicated per-plan endpoint.
 */
export function usePokePlanUsageAllCells({ planCode }: { planCode: string }) {
  const { cells } = useCellContext();

  const [plan, setPlan] = useState<PokePlanWithUsage | null>(null);
  const [cellUsages, setCellUsages] = useState<PokePlanCellUsage[]>(
    emptyArray()
  );
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutate = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional refetch trigger via mutate()
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    const run = async () => {
      const settled = await fetchPokeFromAllCells<GetPokePlansResponseBody>({
        cells,
        path: "/api/poke/plans",
      });

      const usages: PokePlanCellUsage[] = [];
      let combinedTotal = 0;
      let hasErrors = false;
      let foundPlan: PokePlanWithUsage | null = null;

      for (const result of settled) {
        if (!result.ok) {
          hasErrors = true;
          continue;
        }

        const planInCell = result.data.plans.find(
          (candidate) => candidate.code === planCode
        );

        usages.push({
          cell: result.cell.name,
          region: result.cell.region,
          workspaceCount: planInCell ? planInCell.workspaceCount : null,
        });

        if (planInCell) {
          combinedTotal += planInCell.workspaceCount;
          // Plan definitions are seeded identically across cells, so the first cell that has
          // the plan is as good as any for the header.
          foundPlan = foundPlan ?? planInCell;
        }
      }

      if (!cancelled) {
        setPlan(foundPlan);
        setCellUsages(usages);
        setTotalCount(combinedTotal);
        setIsError(hasErrors);
        setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [cells, planCode, refreshKey]);

  return {
    plan,
    cellUsages,
    totalCount,
    mutate,
    isLoading,
    isError,
  };
}
