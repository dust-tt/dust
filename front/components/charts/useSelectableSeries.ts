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

  const toggle = useCallback((key: string) => {
    setSelectedKey((prev) => (prev === key ? undefined : key));
  }, []);

  const isDimmed = useCallback(
    (key: string) => selectedKey !== undefined && selectedKey !== key,
    [selectedKey]
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
          onClick: () => toggle(item.key),
          isActive:
            selectedKey === undefined ? undefined : selectedKey === item.key,
        };
      }),
    [selectedKey, toggle]
  );

  return { selectedKey, activeKey, isDimmed, decorate, hoverHandlers };
}
