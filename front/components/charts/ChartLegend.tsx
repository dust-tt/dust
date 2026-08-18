import { LegendDot } from "@app/components/charts/ChartTooltip";
import { cn } from "@dust-tt/sparkle";

export type LegendEntry = {
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
      colorClassName: "text-primary-300",
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

export type ChartLegendAlignment = "left" | "center" | "right";

const ALIGNMENT_CLASSES: Record<ChartLegendAlignment, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

interface ChartLegendProps {
  items: LegendItem[];
  alignment?: ChartLegendAlignment;
}

export function ChartLegend({ items, alignment = "left" }: ChartLegendProps) {
  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center gap-x-6 gap-y-2",
        ALIGNMENT_CLASSES[alignment]
      )}
    >
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
          <span className="text-sm text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
