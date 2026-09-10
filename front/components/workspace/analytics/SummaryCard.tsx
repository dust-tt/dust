import { cn, LoadingBlock } from "@dust-tt/sparkle";

interface SummaryCardProps {
  className?: string;
  label: string;
  value: string;
  hint: string | null;
}

const CARD_FRAME_CLASSES = cn(
  "flex flex-1 flex-col justify-center h-24 gap-1 rounded-xl",
  "border border-border bg-panel-background p-4"
);

// Same frame as the card so the swap to real content doesn't shift layout.
interface SummaryCardSkeletonProps {
  className?: string;
}

export function SummaryCardSkeleton({ className }: SummaryCardSkeletonProps) {
  return (
    <div aria-hidden="true" className={cn(CARD_FRAME_CLASSES, className)}>
      <LoadingBlock className="h-3 w-32" />
      <div className="flex flex-col gap-1">
        <LoadingBlock className="h-5 w-20" />
        <LoadingBlock className="h-3 w-16" />
      </div>
    </div>
  );
}

export function SummaryCard({
  className,
  label,
  value,
  hint,
}: SummaryCardProps) {
  return (
    <div className={cn(CARD_FRAME_CLASSES, className)}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col">
        <span className="truncate text-base font-semibold text-foreground">
          {value}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
