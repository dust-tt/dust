import { CoinsStacked01, cn, ProgressBar } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

export type CreditUsageTone = "on_target" | "elevated" | "critical";
export type CreditUsageCardVariant = "profile_menu" | "companion";

const CONTAINER_CLASSES: Record<CreditUsageCardVariant, string> = {
  profile_menu: "p-2",
  companion:
    "w-full rounded-xl border border-border bg-background p-3 shadow-sm",
};

const TONE_BAR_CLASSES: Record<CreditUsageTone, string> = {
  on_target: "bg-highlight-500",
  elevated: "bg-warning-500",
  critical: "bg-red-500",
};

const TONE_TEXT_CLASSES: Record<CreditUsageTone, string> = {
  on_target: "text-highlight-500",
  elevated: "text-warning-500",
  critical: "text-red-500",
};

interface CreditUsageCardProps {
  label: string;
  usedPercentage: number;
  tone: CreditUsageTone;
  variant: CreditUsageCardVariant;
  children: ReactNode;
}

export function CreditUsageCard({
  label,
  usedPercentage: rawUsedPercentage,
  tone,
  variant,
  children,
}: CreditUsageCardProps) {
  const usedPercentage = Math.min(Math.max(rawUsedPercentage, 0), 100);

  return (
    <div className={cn("flex flex-col gap-2", CONTAINER_CLASSES[variant])}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm font-medium text-foreground">
          <div className="flex items-center gap-1">
            <CoinsStacked01 className="h-4 w-4 text-muted-foreground" />
            <span>{label}</span>
          </div>
          <span className={TONE_TEXT_CLASSES[tone]}>{usedPercentage}%</span>
        </div>
        <ProgressBar
          aria-label={`${label} used`}
          className="h-1 w-full bg-border"
          values={[
            { value: usedPercentage, className: TONE_BAR_CLASSES[tone] },
            { value: 100 - usedPercentage, className: "bg-transparent" },
          ]}
        />
      </div>
      <div className="text-xs font-medium text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
