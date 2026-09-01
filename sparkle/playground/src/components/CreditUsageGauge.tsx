import { cn, Hoverable } from "@dust-tt/sparkle";

/**
 * The fair-usage gauge from front's `components/app/FairUseCreditsUsage.tsx`
 * (which lives at the bottom of the navigation sidebar in production), plus the
 * upgrade CTA from `components/credits/UsageUpgradeButton.tsx`.
 *
 * In the simplified layout (Figma 14800:125175) this is the body of the
 * "Credit usage" tab in the conversation side panel.
 */

// front: FairUseCreditsUsage
const CREDITS_USAGE_CRITICAL_THRESHOLD = 0.9;

export interface CreditsUsage {
  count: number;
  limit: number;
  timeframe: string;
}

function formatCredits(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function CreditUsageGauge({ usage }: { usage: CreditsUsage }) {
  const { count, limit, timeframe } = usage;
  const percentage = count / limit;
  const isCritical = percentage >= CREDITS_USAGE_CRITICAL_THRESHOLD;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-foreground">Fair usage</span>
          <span className="font-medium text-foreground">
            <span className={cn(isCritical && "text-warning-600")}>
              {formatCredits(count)}
            </span>{" "}
            / {formatCredits(limit)} credits {timeframe}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-primary-100">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isCritical ? "bg-warning-700" : "bg-foreground"
            )}
            style={{ width: `${Math.min(percentage * 100, 100)}%` }}
          />
        </div>
        <div className="mt-2 text-xs">
          <Hoverable variant="highlight">Fair Use policy</Hoverable>
        </div>
      </div>
      <div className="text-xs">
        <Hoverable
          variant="primary"
          className="copy-sm underline underline-offset-2"
        >
          Request an upgrade
        </Hoverable>
      </div>
    </div>
  );
}
