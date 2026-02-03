import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { useState } from "react";

import { AgentFeedback } from "@app/components/observability/AgentFeedback";
import { AgentObservability } from "@app/components/observability/AgentObservability";
import {
  ObservabilityModeSelector,
  ObservabilityPeriodSelector,
} from "@app/components/observability/SharedObservabilityFilterSelector";
import type { LightWorkspaceType } from "@app/types";

type InsightsSubTab = "analytics" | "feedback";

interface CombinedInsightsContentProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function CombinedInsightsContent({
  owner,
  agentConfigurationId,
  isCustomAgent,
}: CombinedInsightsContentProps) {
  const [selectedSubTab, setSelectedSubTab] =
    useState<InsightsSubTab>("analytics");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground dark:text-foreground-night">
          Insights
        </h2>
        <ObservabilityModeSelector
          workspaceId={owner.sId}
          agentConfigurationId={agentConfigurationId}
          isCustomAgent={isCustomAgent}
        />
      </div>
      <Tabs
        value={selectedSubTab}
        onValueChange={(value) => setSelectedSubTab(value as InsightsSubTab)}
      >
        <div className="flex items-center justify-between">
          <TabsList border={true}>
            <TabsTrigger value="analytics" label="Analytics" />
            <TabsTrigger value="feedback" label="Feedback" />
          </TabsList>
          <ObservabilityPeriodSelector
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
          />
        </div>
        <TabsContent value="analytics">
          <AgentObservability
            owner={owner}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={isCustomAgent}
          />
        </TabsContent>
        <TabsContent value="feedback">
          <AgentFeedback
            owner={owner}
            agentConfigurationId={agentConfigurationId}
            allowReactions={isCustomAgent}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
