import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { WorkspaceAnalyticsOverviewCards } from "@app/components/workspace/analytics/WorkspaceAnalyticsOverviewCards";
import { WorkspaceAnalyticsTimeRangeSelector } from "@app/components/workspace/analytics/WorkspaceAnalyticsTimeRangeSelector";
import { WorkspaceSkillUsageChart } from "@app/components/workspace/analytics/WorkspaceSkillUsageChart";
import { WorkspaceSourceChart } from "@app/components/workspace/analytics/WorkspaceSourceChart";
import { WorkspaceToolUsageChart } from "@app/components/workspace/analytics/WorkspaceToolUsageChart";
import { WorkspaceTopAgentsTable } from "@app/components/workspace/analytics/WorkspaceTopAgentsTable";
import { WorkspaceTopUsersTable } from "@app/components/workspace/analytics/WorkspaceTopUsersTable";
import { WorkspaceUsageChart } from "@app/components/workspace/analytics/WorkspaceUsageChart";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { BarChartIcon, Page } from "@dust-tt/sparkle";
import { useState } from "react";

export function AnalyticsPage() {
  const owner = useWorkspace();
  const [period, setPeriod] =
    useState<ObservabilityTimeRangeType>(DEFAULT_PERIOD_DAYS);

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title={
          <div className="flex flex-row w-full justify-between">
            <div>
              <Page.H variant="h3">Analytics</Page.H>
            </div>
            <div>
              <WorkspaceAnalyticsTimeRangeSelector
                period={period}
                onPeriodChange={setPeriod}
              />
            </div>
          </div>
        }
        icon={BarChartIcon}
        description="Track how your team uses Dust"
      />
      <WorkspaceAnalyticsOverviewCards
        workspaceId={owner.sId}
        period={period}
      />
      <div className="flex flex-col pb-8 gap-8">
        <WorkspaceUsageChart workspaceId={owner.sId} period={period} />
        <WorkspaceSourceChart workspaceId={owner.sId} period={period} />
        <WorkspaceToolUsageChart workspaceId={owner.sId} period={period} />
        <WorkspaceSkillUsageChart workspaceId={owner.sId} period={period} />
        <WorkspaceTopUsersTable workspaceId={owner.sId} period={period} />
        <WorkspaceTopAgentsTable workspaceId={owner.sId} period={period} />
      </div>
    </Page.Vertical>
  );
}
