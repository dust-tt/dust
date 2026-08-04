import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { BarChart01, cn, Page } from "@dust-tt/sparkle";

/**
 * The consumption-backed Analytics dashboard, built alongside `AnalyticsPage`
 * behind `enable_analytics_consumption` until it reaches parity.
 */
export function AnalyticsConsumptionPage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title={<Page.H variant="h3">Analytics</Page.H>}
        icon={BarChart01}
      />
      {hasFeature("enable_analytics_consumption") ? (
        <ConsumptionOverview workspaceId={owner.sId} />
      ) : (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-6",
            "border-border bg-muted"
          )}
        >
          <p className="heading-lg text-foreground">Analytics</p>
          <p className="text-sm text-muted-foreground">
            This version of Analytics is not enabled for this workspace.
          </p>
        </div>
      )}
    </Page.Vertical>
  );
}
