import type { AgentMemorySummaryType } from "@app/types/api/user_profile";
import { AssistantCard, CardGrid, Spinner } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

interface AgentMemoryCardsProps {
  agentMemories: AgentMemorySummaryType[];
  isLoading: boolean;
  onAgentClick?: (agentId: string) => void;
}

// One card per agent holding memories about the current user, showing its latest memory.
export function AgentMemoryCards({
  agentMemories,
  isLoading,
  onAgentClick,
}: AgentMemoryCardsProps) {
  const { t } = useLingui();

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  if (agentMemories.length === 0) {
    return (
      <p className="copy-sm text-muted-foreground">
        <Trans>Agents haven't remembered anything about you yet.</Trans>
      </p>
    );
  }

  return (
    <CardGrid>
      {agentMemories.map(({ agent, memoriesCount, latestContent }) => (
        <AssistantCard
          key={agent.sId}
          title={agent.name}
          pictureUrl={agent.pictureUrl}
          subtitle={t`${plural(memoriesCount, {
            one: "# memory",
            other: "# memories",
          })}`}
          description={latestContent}
          iconSize="md"
          onClick={onAgentClick ? () => onAgentClick(agent.sId) : undefined}
        />
      ))}
    </CardGrid>
  );
}
