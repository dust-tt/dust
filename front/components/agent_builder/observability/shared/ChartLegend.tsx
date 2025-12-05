import { LegendDot } from "@app/components/agent_builder/observability/shared/ChartTooltip";

type LegendEntry = {
  key: string;
  label: string;
  colorClassName: string;
};

export function legendFromConstant<K extends string>(
  legend: ReadonlyArray<{ key: K; label: string }>,
  palette: Readonly<Record<K, string>>,
  options?: { includeVersionMarker?: boolean }
): LegendEntry[] {
  const base: LegendEntry[] = legend.map(({ key, label }) => ({
    key: String(key),
    label,
    colorClassName: palette[key],
  }));

  if (options?.includeVersionMarker) {
    base.push({
      key: "versionMarkers",
      label: "Version",
      colorClassName: "text-gray-300 dark:text-gray-300-night",
    });
  }

  return base;
}

export interface LegendItem {
  key: string;
  label: string;
  colorClassName: string;
  onClick?: () => void;
  isActive?: boolean;
}

interface ChartLegendProps {
  items: LegendItem[];
}

export function ChartLegend({ items }: ChartLegendProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((item) => (
        <div
          key={item.key}
          className={`flex items-center gap-2 ${
            item.onClick
              ? "cursor-pointer transition-opacity hover:opacity-80"
              : ""
          } ${item.isActive === false ? "opacity-20" : ""}`}
          onClick={item.onClick}
        >
          <LegendDot
            className={item.colorClassName}
            rounded={item.key === "versionMarkers" ? "full" : "sm"}
          />
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
