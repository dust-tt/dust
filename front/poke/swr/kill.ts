import type { GetKillSwitchesResponseBody } from "@app/lib/api/poke/kill";
import { useCellContext } from "@app/lib/auth/CellContext";
import type { KillSwitchType } from "@app/lib/poke/types";
import { emptyArray } from "@app/lib/swr/swr";
import { fetchPokeFromAllCells } from "@app/poke/swr/cells";
import type { CellType } from "@app/types/cell";
import type { RegionType } from "@app/types/region";
import { useCallback, useEffect, useState } from "react";

export interface KillSwitchesForCell {
  cell: CellType;
  region: RegionType;
  url: string;
  killSwitches: KillSwitchType[];
}

export function usePokeKillSwitchesAllCells() {
  const { cells } = useCellContext();
  const [killSwitchesByCell, setKillSwitchesByCell] = useState<
    KillSwitchesForCell[]
  >(emptyArray());
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const mutateKillSwitches = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional refetch trigger via mutateKillSwitches()
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    const run = async () => {
      const settled = await fetchPokeFromAllCells<GetKillSwitchesResponseBody>({
        cells,
        path: "/api/poke/kill",
      });

      const byCell: KillSwitchesForCell[] = [];
      let hasErrors = false;

      for (const result of settled) {
        if (!result.ok) {
          hasErrors = true;
          continue;
        }
        byCell.push({
          cell: result.cell.name,
          region: result.cell.region,
          url: result.cell.url,
          killSwitches: result.data.killSwitches,
        });
      }

      // Keep catalog order so the UI stays stable across refreshes.
      byCell.sort(
        (a, b) =>
          cells.findIndex((cell) => cell.name === a.cell) -
          cells.findIndex((cell) => cell.name === b.cell)
      );

      if (!cancelled) {
        setKillSwitchesByCell(byCell);
        setIsError(hasErrors);
        setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [cells, refreshKey]);

  return {
    killSwitchesByCell,
    cells,
    isKillSwitchesLoading: isLoading,
    isKillSwitchesError: isError,
    mutateKillSwitches,
  };
}
