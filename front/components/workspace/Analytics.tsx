import { Page, Spinner, ValueCard } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";

import { useWorkspaceAnalytics } from "@app/lib/swr/workspaces";

interface QuickInsightsProps {
  owner: WorkspaceType;
}

export function QuickInsights({ owner }: QuickInsightsProps) {
  const { analytics, isMemberCountLoading } = useWorkspaceAnalytics({
    workspaceId: owner.sId,
    disabled: false,
  });

  return (
    <div className="flex flex-grow flex-col gap-1">
      <Page.H variant="h6">Quick insights</Page.H>
      {!analytics || isMemberCountLoading ? (
        <div className="flex h-full min-h-28 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ValueCard
            title="Members"
            subtitle="Total members"
            content={
              <div className="text-lg font-semibold text-foreground dark:text-foreground-night">
                {analytics.memberCount}
              </div>
            }
            className="w-full"
          />
          <ValueCard
            title="Daily Active Members"
            subtitle="Average on 7 days"
            content={
              <div className="flex flex-col gap-1">
                <div className="text-lg font-semibold text-foreground dark:text-foreground-night">
                  {analytics.averageWeeklyDailyActiveUsers.count}
                </div>
              </div>
            }
            className="w-full"
          />
          <ValueCard
            title="Active Members"
            subtitle="Last 7 days"
            content={
              <div className="grid grid-cols-2">
                <div className="text-lg font-semibold text-foreground dark:text-foreground-night">
                  {analytics.weeklyActiveUsers.count}
                </div>
                <div className="text-lg font-semibold text-foreground dark:text-foreground-night">
                  {`${analytics.weeklyActiveUsers.growth >= 0 ? "+" : ""}${Math.floor(
                    analytics.weeklyActiveUsers.growth
                  )}%`}
                </div>
              </div>
            }
            className="w-full"
          />
          <ValueCard
            title="Active Members"
            subtitle="Last 30 days"
            content={
              <div className="grid grid-cols-2">
                <div className="text-lg font-semibold text-foreground dark:text-foreground-night">
                  {analytics.monthlyActiveUsers.count}
                </div>
                <div className="text-lg font-semibold text-foreground dark:text-foreground-night">
                  {`${analytics.monthlyActiveUsers.growth >= 0 ? "+" : ""}${Math.floor(
                    analytics.monthlyActiveUsers.growth
                  )}%`}
                </div>
              </div>
            }
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
