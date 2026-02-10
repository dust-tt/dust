import {
  HandThumbDownIcon,
  HandThumbUpIcon,
  ValueCard,
} from "@dust-tt/sparkle";
import { lazy, Suspense } from "react";

import { FeedbacksSection } from "@app/components/agent_builder/FeedbacksSection";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { useAgentAnalytics } from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types";

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

interface AgentFeedbackProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
  allowReactions: boolean;
}

export function AgentFeedback({
  owner,
  agentConfigurationId,
  allowReactions,
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

  return (
    <div className="flex flex-col gap-6 pt-4">
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
    </div>
  );
}
