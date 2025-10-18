import { LegendDot } from "@app/components/agent_builder/observability/ChartTooltip";

interface LegendItem {
  key: string;
  label: string;
  colorClassName: string;
}

interface ChartLegendProps {
  items: LegendItem[];
}

export function ChartLegend({ items }: ChartLegendProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <LegendDot className={item.colorClassName} />
          <span className="text-sm text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
