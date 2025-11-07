import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  ValueCard,
} from "@dust-tt/sparkle";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { FeedbacksSection } from "@app/components/agent_builder/FeedbacksSection";
import { FeedbackDistributionChart } from "@app/components/agent_builder/observability/charts/FeedbackDistributionChart";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { SharedObservabilityFilterSelector } from "@app/components/observability/SharedObservabilityFilterSelector";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import {
  useAgentAnalytics,
  useAgentConfiguration,
} from "@app/lib/swr/assistants";

function NoAgentState() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="px-4 text-center">
        <div className="mb-2 text-lg font-medium text-foreground">
          No Performance Data Available
        </div>
        <div className="max-w-sm text-muted-foreground">
          Performance metrics will be available after your agent is created and
          used in conversations.
        </div>
      </div>
    </div>
  );
}

interface AgentBuilderPerformanceProps {
  agentConfigurationSId?: string;
}

export function AgentBuilderPerformance({
  agentConfigurationSId,
}: AgentBuilderPerformanceProps) {
  const { owner } = useAgentBuilderContext();
  const { period } = useObservabilityContext();

  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    agentConfigurationId: agentConfigurationSId || null,
  });

  const { agentAnalytics } = useAgentAnalytics({
    workspaceId: owner.sId,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    agentConfigurationId: agentConfiguration?.sId || null,
    period,
  });

  if (!agentConfiguration) {
    return <NoAgentState />;
  }

  return (
    <TabContentLayout
      title="Feedback"
      headerAction={
        <SharedObservabilityFilterSelector
          workspaceId={owner.sId}
          agentConfigurationId={agentConfiguration.sId}
        />
      }
    >
      <TabContentChildSectionLayout title="Overview">
        <>
          <ValueCard
            title="Reactions"
            className="h-24"
            content={
              <div className="flex flex-row gap-4 text-2xl">
                {agentConfiguration.scope !== "global" &&
                agentAnalytics?.feedbacks ? (
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

          <FeedbackDistributionChart
            workspaceId={owner.sId}
            agentConfigurationId={agentConfiguration.sId}
          />

          {agentConfiguration.scope !== "global" && (
            <FeedbacksSection
              owner={owner}
              agentConfigurationId={agentConfiguration.sId}
            />
          )}
        </>
      </TabContentChildSectionLayout>
    </TabContentLayout>
  );
}
