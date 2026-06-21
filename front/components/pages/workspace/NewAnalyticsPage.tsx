import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { DEFAULT_PERIOD_DAYS } from "@app/components/agent_builder/observability/constants";
import { WorkspaceAnalyticsOverviewCards } from "@app/components/workspace/analytics/WorkspaceAnalyticsOverviewCards";
import { WorkspaceAnalyticsTimeRangeSelector } from "@app/components/workspace/analytics/WorkspaceAnalyticsTimeRangeSelector";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { isNavigationLocked } from "@app/lib/navigation-lock";
import { BarChart01, Page, SafeSuspense, safeLazy } from "@dust-tt/sparkle";
import { useState } from "react";

// Dynamic imports for chart components to exclude recharts from server bundle.

const canReload = () => !isNavigationLocked();

const AwuUsageFromAnalyticsChart = safeLazy(
  () =>
    import("@app/components/workspace/AwuUsageFromAnalyticsChart").then(
      (mod) => ({
        default: mod.AwuUsageFromAnalyticsChart,
      })
    ),
  { canReload }
);
const WorkspaceUsageChart = safeLazy(
  () =>
    import("@app/components/workspace/analytics/WorkspaceUsageChart").then(
      (mod) => ({
        default: mod.WorkspaceUsageChart,
      })
    ),
  { canReload }
);
const WorkspaceSourceChart = safeLazy(
  () =>
    import("@app/components/workspace/analytics/WorkspaceSourceChart").then(
      (mod) => ({
        default: mod.WorkspaceSourceChart,
      })
    ),
  { canReload }
);
const WorkspaceToolUsageChart = safeLazy(
  () =>
    import("@app/components/workspace/analytics/WorkspaceToolUsageChart").then(
      (mod) => ({
        default: mod.WorkspaceToolUsageChart,
      })
    ),
  { canReload }
);
const WorkspaceSkillUsageChart = safeLazy(
  () =>
    import("@app/components/workspace/analytics/WorkspaceSkillUsageChart").then(
      (mod) => ({
        default: mod.WorkspaceSkillUsageChart,
      })
    ),
  { canReload }
);

function ChartFallback() {
  return (
    <div className="h-64 animate-pulse rounded-lg bg-muted-background dark:bg-muted-background-night" />
  );
}

export function NewAnalyticsPage() {
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
        icon={BarChart01}
        description="Track how your team uses Dust"
      />
      <WorkspaceAnalyticsOverviewCards
        workspaceId={owner.sId}
        period={period}
      />
      <div className="flex flex-col pb-8 gap-8">
        <SafeSuspense fallback={<ChartFallback />}>
          <AwuUsageFromAnalyticsChart workspaceId={owner.sId} period={period} />
        </SafeSuspense>
        <SafeSuspense fallback={<ChartFallback />}>
          <WorkspaceUsageChart workspaceId={owner.sId} period={period} />
        </SafeSuspense>
        <SafeSuspense fallback={<ChartFallback />}>
          <WorkspaceSourceChart workspaceId={owner.sId} period={period} />
        </SafeSuspense>
        <SafeSuspense fallback={<ChartFallback />}>
          <WorkspaceToolUsageChart workspaceId={owner.sId} period={period} />
        </SafeSuspense>
        <SafeSuspense fallback={<ChartFallback />}>
          <WorkspaceSkillUsageChart workspaceId={owner.sId} period={period} />
        </SafeSuspense>
      </div>
    </Page.Vertical>
  );
}
