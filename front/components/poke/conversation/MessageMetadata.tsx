import { Chip, cn } from "@dust-tt/sparkle";
import type { ComponentProps, ReactNode } from "react";

export type ChipColor = NonNullable<ComponentProps<typeof Chip>["color"]>;

interface StatusBadgeProps {
  label: string;
  color: ChipColor;
}

export function StatusBadge({ label, color }: StatusBadgeProps) {
  return <Chip color={color} label={label} size="xs" />;
}

interface MetadataItemProps {
  label: string;
  children: ReactNode;
  mono?: boolean;
}

export function MetadataItem({ label, children, mono }: MetadataItemProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-sm text-foreground",
          mono ? "font-mono tabular-nums" : null
        )}
      >
        {children}
      </span>
    </span>
  );
}
