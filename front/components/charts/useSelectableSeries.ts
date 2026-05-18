import type {
  LegendEntry,
  LegendItem,
} from "@app/components/charts/ChartLegend";
import { useHoveredSeries } from "@app/components/charts/useHoveredSeries";
import { useCallback, useEffect, useState } from "react";

export function useSelectableSeries(visibleKeys?: readonly string[]) {
  const { hoveredKey, hoverHandlers } = useHoveredSeries();
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);

  // Clear the selection when the selected series is no longer visible (e.g. the
  // user removed it from a series picker), otherwise every remaining line would
  // be dimmed.
  useEffect(() => {
    if (
      selectedKey !== undefined &&
      visibleKeys !== undefined &&
      !visibleKeys.includes(selectedKey)
    ) {
      setSelectedKey(undefined);
    }
  }, [selectedKey, visibleKeys]);

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
