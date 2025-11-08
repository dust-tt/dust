import { BarChartIcon, cn, LoadingBlock } from "@dust-tt/sparkle";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { EmptyPlaceholder } from "@app/components/agent_builder/observability/shared/EmptyPlaceholder";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { AgentObservability } from "@app/components/observability/AgentObservability";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

interface AgentBuilderObservabilityProps {
  agentConfigurationSId: string;
}

export function AgentBuilderObservability({
  agentConfigurationSId,
}: AgentBuilderObservabilityProps) {
  const { owner } = useAgentBuilderContext();
  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationSId,
    });

  if (isAgentConfigurationLoading) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <ChartContainerSkeleton />
        <ChartContainerSkeleton />
        <ChartContainerSkeleton />
        <ChartContainerSkeleton />
        <ChartContainerSkeleton />
      </div>
    );
  }

  if (!agentConfiguration) {
    return (
      <TabContentLayout title="Insights">
        <EmptyPlaceholder
          icon={BarChartIcon}
          title="Waiting for data"
          description="Use your agent or share it with your team to see performance data."
        />
      </TabContentLayout>
    );
  }

  return (
    <AgentObservability
      workspaceId={owner.sId}
      agentConfigurationId={agentConfiguration.sId}
      isCustomAgent={agentConfiguration.scope !== "global"}
    />
  );
}

function ChartContainerSkeleton() {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-lg border border-border p-4"
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <LoadingBlock className="h-6 w-40 rounded-md" />
      </div>
      <div className="flex-1">
        <LoadingBlock className="h-full w-full rounded-xl" />
      </div>
    </div>
  );
}
