import { Card, Page, Spinner } from "@dust-tt/sparkle";
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
          <Card
            title="Members"
            subtitle="Total members"
            content={
              <div className="text-lg font-semibold text-element-900">
                {analytics.memberCount}
              </div>
            }
            size="sm"
            className="w-full"
          />
          <Card
            title="Daily Active Members"
            subtitle="Average on 7 days"
            content={
              <div className="flex flex-col gap-1">
                <div className="text-lg font-semibold text-element-900">
                  {analytics.averageWeeklyDailyActiveUsers.count}
                </div>
              </div>
            }
            size="sm"
            className="w-full"
          />
          <Card
            title="Active Members"
            subtitle="Last 7 days"
            content={
              <div className="grid grid-cols-2">
                <div className="text-lg font-semibold text-element-900">
                  {analytics.weeklyActiveUsers.count}
                </div>
                <div className="text-lg font-semibold text-element-900">
                  {`${analytics.weeklyActiveUsers.growth >= 0 ? "+" : ""}${Math.floor(
                    analytics.weeklyActiveUsers.growth
                  )}%`}
                </div>
              </div>
            }
            size="sm"
            className="w-full"
          />
          <Card
            title="Active Members"
            subtitle="Last 30 days"
            content={
              <div className="grid grid-cols-2">
                <div className="text-lg font-semibold text-element-900">
                  {analytics.monthlyActiveUsers.count}
                </div>
                <div className="text-lg font-semibold text-element-900">
                  {`${analytics.monthlyActiveUsers.growth >= 0 ? "+" : ""}${Math.floor(
                    analytics.monthlyActiveUsers.growth
                  )}%`}
                </div>
              </div>
            }
            size="sm"
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
