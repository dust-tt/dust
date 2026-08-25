import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { AgentFeedback } from "@app/components/observability/AgentFeedback";
import {
  ObservabilityModeSelector,
  ObservabilityPeriodSelector,
} from "@app/components/observability/SharedObservabilityFilterSelector";
import { ConsumptionPeriodSelector } from "@app/components/workspace/analytics/consumption/ConsumptionPeriodSelector";
import { ScopedConsumptionAnalytics } from "@app/components/workspace/analytics/consumption/ScopedConsumptionAnalytics";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD } from "@app/lib/analytics/consumption_period";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { useState } from "react";

type InsightsSubTab = "analytics" | "feedback";

interface AgentInsightsTabProps {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
}

export function AgentInsightsTab({
  owner,
  agentConfiguration,
}: AgentInsightsTabProps) {
  const [selectedSubTab, setSelectedSubTab] =
    useState<InsightsSubTab>("analytics");
  const [period, setPeriod] = useState<ConsumptionPeriodSelection>(
    DEFAULT_CONSUMPTION_PERIOD
  );
  const agentId = agentConfiguration.sId;
  const isCustomAgent = agentConfiguration.scope !== "global";

  return (
    <ObservabilityProvider>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Insights</h2>
          {selectedSubTab === "feedback" && (
            <ObservabilityModeSelector
              workspaceId={owner.sId}
              agentConfigurationId={agentId}
              isCustomAgent={isCustomAgent}
            />
          )}
        </div>
        <Tabs
          value={selectedSubTab}
          onValueChange={(value) => {
            if (value === "analytics" || value === "feedback") {
              setSelectedSubTab(value);
            }
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <TabsList border>
              <TabsTrigger value="analytics" label="Analytics" />
              <TabsTrigger value="feedback" label="Feedback" />
            </TabsList>
            {selectedSubTab === "analytics" ? (
              <ConsumptionPeriodSelector
                period={period}
                onPeriodChange={setPeriod}
              />
            ) : (
              <ObservabilityPeriodSelector
                workspaceId={owner.sId}
                agentConfigurationId={agentId}
                isCustomAgent={isCustomAgent}
              />
            )}
          </div>
          <TabsContent value="analytics">
            <div className="pt-4">
              <ScopedConsumptionAnalytics
                owner={owner}
                period={period}
                scope={{ type: "agent", id: agentId }}
                defaultDimension="user"
              />
            </div>
          </TabsContent>
          <TabsContent value="feedback">
            <AgentFeedback
              owner={owner}
              agentConfigurationId={agentId}
              allowReactions={isCustomAgent}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ObservabilityProvider>
  );
}
