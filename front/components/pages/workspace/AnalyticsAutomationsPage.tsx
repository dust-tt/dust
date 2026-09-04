import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { AutomationsOverview } from "@app/components/workspace/analytics/automations/AutomationsOverview";
import { AutomationsTriggersTable } from "@app/components/workspace/analytics/automations/AutomationsTriggersTable";
import type { AutomationsFilter } from "@app/components/workspace/analytics/automationsFilter";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { Page } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

export function AnalyticsAutomationsPage() {
  const owner = useWorkspace();
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const [filter, setFilter] = useState<AutomationsFilter>({});

  useEffect(() => {
    trackEvent({
      area: TRACKING_AREAS.ANALYTICS,
      object: "automations_page",
      action: TRACKING_ACTIONS.VIEW,
      extra: { workspace_id: owner.sId },
    });
  }, [owner.sId]);

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header
          title={
            <div className="flex w-full flex-row justify-between">
              <div className="flex flex-col gap-1">
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

        <AutomationsOverview owner={owner} period={period} />

        <AutomationsTriggersTable
          owner={owner}
          period={period}
          filter={filter}
          onFilterChange={setFilter}
        />
      </Page.Vertical>
    </AdminPageContainer>
  );
}
