import { AutomationsOverview } from "@app/components/workspace/analytics/automations/AutomationsOverview";
import { AutomationsTriggersTable } from "@app/components/workspace/analytics/automations/AutomationsTriggersTable";
import { SlackWorkflowsTab } from "@app/components/workspace/analytics/automations/SlackWorkflowsTab";
import type { AutomationsFilter } from "@app/components/workspace/analytics/automationsFilter";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { isCreditPricedPlan } from "@app/types/plan";
import { isAdmin } from "@app/types/user";
import {
  Page,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

type AutomationsTab = "triggers" | "slack-workflows";

export function AnalyticsAutomationsPage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const [filter, setFilter] = useState<AutomationsFilter>({});
  const [tab, setTab] = useState<AutomationsTab>("triggers");

  const canManageSlackWorkflows =
    isAdmin(owner) && isCreditPricedPlan(subscription.plan);

  useEffect(() => {
    trackEvent({
      area: TRACKING_AREAS.ANALYTICS,
      object: "automations_page",
      action: TRACKING_ACTIONS.VIEW,
      extra: { workspace_id: owner.sId },
    });
  }, [owner.sId]);

  return (
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

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setTab(value === "slack-workflows" ? "slack-workflows" : "triggers")
        }
      >
        <TabsList className="mb-4">
          <TabsTrigger value="triggers" label="Triggers" />
          {canManageSlackWorkflows && (
            <TabsTrigger value="slack-workflows" label="Slack workflows" />
          )}
        </TabsList>
        <TabsContent value="triggers">
          <div className="flex flex-col gap-4">
            <AutomationsOverview owner={owner} period={period} />
            <AutomationsTriggersTable
              owner={owner}
              period={period}
              filter={filter}
              onFilterChange={setFilter}
            />
          </div>
        </TabsContent>
        {canManageSlackWorkflows && (
          <TabsContent value="slack-workflows">
            <SlackWorkflowsTab owner={owner} period={period} />
          </TabsContent>
        )}
      </Tabs>
    </Page.Vertical>
  );
}
