import type {
  LegendEntry,
  LegendItem,
} from "@app/components/charts/ChartLegend";
import { useHoveredSeries } from "@app/components/charts/useHoveredSeries";
import { useCallback, useState } from "react";

export function useSelectableSeries() {
  const { hoveredKey, hoverHandlers } = useHoveredSeries();
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);

  const activeKey = hoveredKey ?? selectedKey;

  const isDimmed = useCallback(
    (key: string) => selectedKey !== undefined && selectedKey !== key,
    [selectedKey]
  );

  const lineActiveDot = useCallback(
    (key: string): false | undefined => (isDimmed(key) ? false : undefined),
    [isDimmed]
  );

  const decorate = useCallback(
    (
      items: readonly LegendEntry[],
      options?: { skip?: (item: LegendEntry) => boolean }
    ): LegendItem[] =>
      items.map((item) => {
        if (options?.skip?.(item)) {
          return item;
        }
        return {
          ...item,
          onClick: () =>
            setSelectedKey((prev) =>
              prev === item.key ? undefined : item.key
            ),
          isActive:
            selectedKey === undefined ? undefined : selectedKey === item.key,
        };
      }),
    [selectedKey]
  );

  return {
    selectedKey,
    activeKey,
    isDimmed,
    lineActiveDot,
    decorate,
    hoverHandlers,
  };
}
