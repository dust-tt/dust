import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { CombinedInsightsContent } from "@app/components/observability/CombinedInsightsContent";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { cn, LoadingBlock } from "@dust-tt/sparkle";

interface AgentBuilderInsightsProps {
  agentConfigurationSId: string;
}

export function AgentBuilderInsights({
  agentConfigurationSId,
}: AgentBuilderInsightsProps) {
  const { owner } = useAgentBuilderContext();

  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationSId,
    });

  if (isAgentConfigurationLoading || !agentConfiguration) {
    return (
      <div className="grid grid-cols-1 gap-6 p-4">
        <ChartContainerSkeleton />
        <ChartContainerSkeleton />
        <ChartContainerSkeleton />
      </div>
    );
  }

  const isCustomAgent = agentConfiguration.scope !== "global";

  return (
    <section className="flex h-full flex-col overflow-y-auto p-4">
      <CombinedInsightsContent
        owner={owner}
        agentConfigurationId={agentConfiguration.sId}
        isCustomAgent={isCustomAgent}
      />
    </section>
  );
}

function ChartContainerSkeleton() {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-lg border border-border p-4 dark:border-border-night"
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
