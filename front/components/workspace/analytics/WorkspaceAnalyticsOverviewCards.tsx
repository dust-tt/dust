import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { useWorkspaceAnalyticsOverview } from "@app/lib/swr/workspaces";
import { Spinner, ValueCard } from "@dust-tt/sparkle";

interface WorkspaceAnalyticsOverviewCardsProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export function WorkspaceAnalyticsOverviewCards({
  workspaceId,
  period,
}: WorkspaceAnalyticsOverviewCardsProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useWorkspaceAnalyticsOverview({
      workspaceId,
      days: period,
      disabled: !workspaceId,
    });

  if (isOverviewLoading) {
    return (
      <div className="w-full p-6">
        <Spinner />
      </div>
    );
  }

  const totalMembers =
    isOverviewError || overview?.totalMembers === undefined
      ? "-"
      : overview.totalMembers.toLocaleString();
  const activeUsers =
    isOverviewError || overview?.activeUsers === undefined
      ? "-"
      : overview.activeUsers.toLocaleString();

  return (
    <div className="grid grid-cols-2 gap-6">
      <ValueCard
        title="Total members"
        className="h-24"
        content={
          <div className="flex flex-col gap-1 text-2xl">
            <div className="truncate text-foreground dark:text-foreground-night">
              {totalMembers}
            </div>
          </div>
        }
      />
      <ValueCard
        title={`Active users (last ${period} days)`}
        className="h-24"
        content={
          <div className="flex flex-col gap-1 text-2xl">
            <div className="truncate text-foreground dark:text-foreground-night">
              {activeUsers}
            </div>
          </div>
        }
      />
    </div>
  );
}
