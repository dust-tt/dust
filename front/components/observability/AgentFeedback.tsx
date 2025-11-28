import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  ValueCard,
} from "@dust-tt/sparkle";

import { FeedbacksSection } from "@app/components/agent_builder/FeedbacksSection";
import { FeedbackDistributionChart } from "@app/components/agent_builder/observability/charts/FeedbackDistributionChart";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { SharedObservabilityFilterSelector } from "@app/components/observability/SharedObservabilityFilterSelector";
import { useAgentAnalytics } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types";

interface AgentFeedbackProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  allowReactions: boolean;
  title?: string;
}

export function AgentFeedback({
  owner,
  agentConfigurationId,
  allowReactions,
  title = "Feedback",
}: AgentFeedbackProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const { agentAnalytics } = useAgentAnalytics({
    workspaceId: owner.sId,
    agentConfigurationId,
    period,
    version: mode === "version" ? selectedVersion?.version : undefined,
  });

  return (
    <TabContentLayout
      title={title}
      headerAction={
        <SharedObservabilityFilterSelector
          workspaceId={owner.sId}
          agentConfigurationId={agentConfigurationId}
        />
      }
    >
      <TabContentChildSectionLayout title="Overview">
        <ValueCard
          title="Reactions"
          className="h-24"
          content={
            <div className="flex flex-row gap-4 text-2xl">
              {allowReactions && agentAnalytics?.feedbacks ? (
                <>
                  <div className="flex flex-row items-center">
                    <HandThumbUpIcon className="w-7 pr-2 text-gray-400 dark:text-muted-foreground-night" />
                    <div>{agentAnalytics.feedbacks.positiveFeedbacks}</div>
                  </div>
                  <div className="flex flex-row items-center">
                    <HandThumbDownIcon className="w-7 pr-2 text-gray-400 dark:text-muted-foreground-night" />
                    <div>{agentAnalytics.feedbacks.negativeFeedbacks}</div>
                  </div>
                </>
              ) : (
                "-"
              )}
            </div>
          }
        />
      </TabContentChildSectionLayout>

      <TabContentChildSectionLayout title="Charts">
        <FeedbackDistributionChart
          workspaceId={owner.sId}
          agentConfigurationId={agentConfigurationId}
        />
      </TabContentChildSectionLayout>

      {allowReactions && (
        <FeedbacksSection
          owner={owner}
          agentConfigurationId={agentConfigurationId}
        />
      )}
    </TabContentLayout>
  );
}
