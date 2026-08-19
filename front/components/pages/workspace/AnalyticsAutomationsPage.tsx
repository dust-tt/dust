import { AutomationsApiKeysTable } from "@app/components/workspace/analytics/automations/AutomationsApiKeysTable";
import { AutomationsOverview } from "@app/components/workspace/analytics/automations/AutomationsOverview";
import { AutomationsTriggersTable } from "@app/components/workspace/analytics/automations/AutomationsTriggersTable";
import type { AutomationsFilter } from "@app/components/workspace/analytics/automationsFilter";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { cn, Page, Tabs, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { useState } from "react";

type AutomationsView = "triggers" | "api_keys";

function isAutomationsView(value: string): value is AutomationsView {
  return value === "triggers" || value === "api_keys";
}

export function AnalyticsAutomationsPage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const isEnabled = hasFeature("enable_analytics_automations");
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const [filter, setFilter] = useState<AutomationsFilter>({});
  const [view, setView] = useState<AutomationsView>("triggers");

  if (!isEnabled) {
    return (
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title={<Page.H variant="h3">Automations</Page.H>} />
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
              <Page.H variant="h3">Automations</Page.H>
              <Page.P variant="secondary">
                Everything that runs on its own: who set it up, how often it
                runs, what it costs.
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
        <div className="flex flex-col gap-3">
          <Tabs
            value={view}
            onValueChange={(value) => {
              if (isAutomationsView(value)) {
                setView(value);
              }
            }}
          >
            <TabsList border>
              <TabsTrigger value="triggers" label="Triggers" />
              <TabsTrigger value="api_keys" label="API keys" />
            </TabsList>
          </Tabs>
          {view === "triggers" ? (
            <AutomationsTriggersTable
              owner={owner}
              period={period}
              filter={filter}
              onFilterChange={setFilter}
            />
          ) : (
            <AutomationsApiKeysTable workspaceId={owner.sId} period={period} />
          )}
        </div>
      </div>
    </Page.Vertical>
  );
}
