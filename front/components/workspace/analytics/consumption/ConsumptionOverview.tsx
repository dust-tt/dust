import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPace } from "@app/lib/api/analytics/consumption/overview";
import { timeAgoFrom } from "@app/lib/utils";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Button, Chip, cn, ValueCard } from "@dust-tt/sparkle";
import { ExternalLinkIcon } from "lucide-react";

interface ConsumptionOverviewProps {
  workspaceId: string;
}

const EMPTY_VALUE = "—";

// The period is resolved in UTC server-side, so it has to be rendered in UTC
// too or a cycle boundary shifts by a day for anyone west of Greenwich.
function formatPeriodBound(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString();
}

function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function paceLabel(pace: ConsumptionPace): string {
  switch (pace) {
    case "under":
      return "Under pace";
    case "on_pace":
      return "On pace";
    case "over":
      return "Over pace";
    default:
      assertNeverAndIgnore(pace);
      return "On pace";
  }
}

function paceColor(pace: ConsumptionPace) {
  switch (pace) {
    case "under":
      return "success" as const;
    case "on_pace":
      return "info" as const;
    case "over":
      return "warning" as const;
    default:
      assertNeverAndIgnore(pace);
      return "info" as const;
  }
}

export function ConsumptionOverview({ workspaceId }: ConsumptionOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useConsumptionOverview({ workspaceId });

  if (isOverviewLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-5 w-80 animate-pulse rounded bg-muted-background" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-muted-background" />
        <div className="grid grid-cols-2 gap-6">
          <div className="h-24 animate-pulse rounded-xl bg-muted-background" />
          <div className="h-24 animate-pulse rounded-xl bg-muted-background" />
        </div>
      </div>
    );
  }

  if (isOverviewError || !overview) {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-xl border p-6",
          "border-border bg-muted"
        )}
      >
        <p className="heading-lg text-foreground">Analytics unavailable</p>
        <p className="text-sm text-muted-foreground">
          We could not load the consumption overview. Please try again later.
        </p>
      </div>
    );
  }

  const { period, members, credits, projection, lastRecordAt } = overview;

  const metaParts = [
    `${formatPeriodBound(period.startDate)} to ${formatPeriodBound(period.endDate)}`,
    `${members.active.toLocaleString()} of ${members.total.toLocaleString()} members active`,
    ...(lastRecordAt
      ? [`Updated ${timeAgoFrom(new Date(lastRecordAt).getTime())} ago`]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{metaParts.join("  |  ")}</p>

      {projection?.pace &&
        credits.usedRatio !== null &&
        projection.projectedRatio !== null && (
          <div
            className={cn(
              "flex flex-row items-center justify-between gap-4",
              "rounded-xl border border-border bg-muted px-4 py-3"
            )}
          >
            <div className="flex flex-row items-center gap-3">
              <Chip
                size="xs"
                color={paceColor(projection.pace)}
                label={paceLabel(projection.pace)}
              />
              <span className="text-sm text-muted-foreground">
                {formatRatio(credits.usedRatio)} of the cap used,{" "}
                {formatRatio(projection.projectedRatio)} of the cycle elapsed
              </span>
            </div>
            <Button
              variant="ghost"
              size="xs"
              label="Manage in Usage"
              icon={ExternalLinkIcon}
              href={`/w/${workspaceId}/usage`}
            />
          </div>
        )}

      <div className="grid grid-cols-2 gap-6">
        <ValueCard
          title="Used this period"
          className="h-24"
          content={
            <div className="flex flex-col gap-1">
              <div className="truncate text-2xl text-foreground">
                {formatCredits(credits.usedCredits)}
              </div>
              <div className="text-xs text-muted-foreground">
                {credits.capCredits !== null && credits.usedRatio !== null
                  ? `${formatRatio(credits.usedRatio)} of ${formatCredits(credits.capCredits)} cap`
                  : "No credit cap on this workspace"}
              </div>
            </div>
          }
        />
        <ValueCard
          title="Projected end of cycle"
          className="h-24"
          content={
            <div className="flex flex-col gap-1">
              <div className="truncate text-2xl text-foreground">
                {projection === null
                  ? EMPTY_VALUE
                  : projection.projectedRatio !== null
                    ? formatRatio(projection.projectedRatio)
                    : formatCredits(projection.projectedCredits)}
              </div>
              <div className="text-xs text-muted-foreground">
                {projection === null
                  ? "Too early in the cycle to project"
                  : projection.pace !== null
                    ? paceLabel(projection.pace)
                    : "credits projected"}
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
