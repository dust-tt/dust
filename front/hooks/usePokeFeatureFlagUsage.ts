import type {
  GetPokeFeatureFlagsResponseBody,
  PokeFeatureFlagUsage,
} from "@app/lib/api/poke/feature_flags";
import { useCellContext } from "@app/lib/auth/CellContext";
import { emptyArray } from "@app/lib/swr/swr";
import { fetchPokeFromAllCells } from "@app/poke/swr/cells";
import type { CellType } from "@app/types/cell";
import type { RegionType } from "@app/types/region";
import type { FeatureFlagStage } from "@app/types/shared/feature_flags";
import { useCallback, useEffect, useState } from "react";

export interface PokeFeatureFlagCellStats {
  cell: CellType;
  region: RegionType;
  workspaceCount: number;
  globalRolloutPercentage: number | null;
}

export interface PokeFeatureFlagUsageAllCells {
  name: string;
  description: string | null;
  stage: FeatureFlagStage | null;
  byCell: PokeFeatureFlagCellStats[];
  totalWorkspaceCount: number;
}

function mergeFeatureFlagUsage(
  results: {
    cell: CellType;
    region: RegionType;
    featureFlags: PokeFeatureFlagUsage[];
  }[]
): PokeFeatureFlagUsageAllCells[] {
  const byName = new Map<string, PokeFeatureFlagUsageAllCells>();

  for (const { cell, region, featureFlags } of results) {
    for (const flag of featureFlags) {
      const existing = byName.get(flag.name);
      const cellStats: PokeFeatureFlagCellStats = {
        cell,
        region,
        workspaceCount: flag.workspaceCount,
        globalRolloutPercentage: flag.globalRolloutPercentage,
      };

      if (!existing) {
        byName.set(flag.name, {
          name: flag.name,
          description: flag.description,
          stage: flag.stage,
          byCell: [cellStats],
          totalWorkspaceCount: flag.workspaceCount,
        });
        continue;
      }

      existing.byCell.push(cellStats);
      existing.totalWorkspaceCount += flag.workspaceCount;
      // Prefer configured metadata over legacy nulls when cells disagree.
      if (existing.description === null && flag.description !== null) {
        existing.description = flag.description;
      }
      if (existing.stage === null && flag.stage !== null) {
        existing.stage = flag.stage;
      }
    }
  }

  return [...byName.values()];
}

export function usePokeFeatureFlagUsageAllCells() {
  const { cells } = useCellContext();
  const [featureFlags, setFeatureFlags] = useState<
    PokeFeatureFlagUsageAllCells[]
  >(emptyArray());
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
      const settled =
        await fetchPokeFromAllCells<GetPokeFeatureFlagsResponseBody>({
          cells,
          path: "/api/poke/feature-flags",
        });

      const okResults = settled.flatMap((result) =>
        result.ok
          ? [
              {
                cell: result.cell.name,
                region: result.cell.region,
                featureFlags: result.data.featureFlags,
              },
            ]
          : []
      );
      const hasErrors = settled.some((result) => !result.ok);

      if (!cancelled) {
        setFeatureFlags(mergeFeatureFlagUsage(okResults));
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
    featureFlags,
    mutate,
    isLoading,
    isError,
  };
}
