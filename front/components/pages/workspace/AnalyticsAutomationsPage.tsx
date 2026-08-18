import { AutomationsOverview } from "@app/components/workspace/analytics/automations/AutomationsOverview";
import { AutomationsTriggersTable } from "@app/components/workspace/analytics/automations/AutomationsTriggersTable";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { cn, Page } from "@dust-tt/sparkle";
import { useState } from "react";

export function AnalyticsAutomationsPage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const isEnabled = hasFeature("enable_analytics_automations");
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );

  if (!isEnabled) {
    return (
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title={<Page.H variant="h3">Automation</Page.H>} />
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
    <Page.Vertical align="stretch" gap="none">
      <Page.Header
        title={
          <div className="flex w-full flex-row justify-between gap-4">
            <div className="flex max-w-[700px] flex-col gap-1">
              <Page.H variant="h3">Automation</Page.H>
              <Page.P variant="secondary">
                Everything that runs on its own: what it costs, how often, and
                who set it up.
              </Page.P>
            </div>
            <ConsumptionPeriodSelector
              period={period}
              onPeriodChange={setPeriod}
            />
          </div>
        }
      />
      <div className="flex flex-col gap-8 pb-8 pt-4">
        <AutomationsOverview workspaceId={owner.sId} period={period} />
        <AutomationsTriggersTable workspaceId={owner.sId} period={period} />
      </div>
    </Page.Vertical>
  );
}
