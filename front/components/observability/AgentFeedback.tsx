import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  ValueCard,
} from "@dust-tt/sparkle";
import { lazy, Suspense } from "react";

import { FeedbacksSection } from "@app/components/agent_builder/FeedbacksSection";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";

const FeedbackDistributionChart = lazy(() =>
  import(
    "@app/components/agent_builder/observability/charts/FeedbackDistributionChart"
  ).then((mod) => ({
    default: mod.FeedbackDistributionChart,
  }))
);

function ChartFallback() {
  return (
    <div className="h-64 animate-pulse rounded-lg bg-muted-background dark:bg-muted-background-night" />
  );
}

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
  hideHeader?: boolean;
}

export function AgentFeedback({
  owner,
  agentConfigurationId,
  allowReactions,
  title = "Feedback",
  hideHeader = false,
}: AgentFeedbackProps) {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const { agentAnalytics } = useAgentAnalytics({
    workspaceId: owner.sId,
    agentConfigurationId,
    period,
    version:
      allowReactions && mode === "version"
        ? selectedVersion?.version
        : undefined,
  });

  const content = (
    <>
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
        <Suspense fallback={<ChartFallback />}>
          <FeedbackDistributionChart
            workspaceId={owner.sId}
            agentConfigurationId={agentConfigurationId}
            isCustomAgent={allowReactions}
          />
        </Suspense>
      </TabContentChildSectionLayout>

      {allowReactions && (
        <FeedbacksSection
          owner={owner}
          agentConfigurationId={agentConfigurationId}
        />
      )}
    </>
  );

  if (hideHeader) {
    return <div className="flex flex-col gap-6 pt-4">{content}</div>;
  }

  return (
    <TabContentLayout
      title={title}
      headerAction={
        <SharedObservabilityFilterSelector
          workspaceId={owner.sId}
          agentConfigurationId={agentConfigurationId}
          isCustomAgent={allowReactions}
        />
      }
    >
      {content}
    </TabContentLayout>
  );
}
