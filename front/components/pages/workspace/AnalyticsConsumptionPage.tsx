import { ConsumptionOverview } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { BarChart01, cn, Page } from "@dust-tt/sparkle";

export function AnalyticsConsumptionPage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const isEnabled = hasFeature("enable_analytics_consumption");

  if (!isEnabled) {
    return (
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header
          title={<Page.H variant="h3">Analytics</Page.H>}
          icon={BarChart01}
        />
        <div
          className={cn(
            "flex flex-col gap-2 rounded-xl border p-6",
            "border-border bg-muted"
          )}
        >
          <p className="text-sm text-muted-foreground">
            This page is not enabled for this workspace.
          </p>
        </div>
      </Page.Vertical>
    );
  }

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header
        title={<Page.H variant="h3">Analytics</Page.H>}
        icon={BarChart01}
      />
      <ConsumptionOverview workspaceId={owner.sId} />
    </Page.Vertical>
  );
}
