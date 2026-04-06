import { useAgentReinforcementToggle } from "@app/lib/swr/useAgentReinforcementToggle";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, SliderToggle, SparklesIcon } from "@dust-tt/sparkle";

interface AgentReinforcementToggleProps {
  owner: WorkspaceType;
}

export function AgentReinforcementToggle({
  owner,
}: AgentReinforcementToggleProps) {
  const { isEnabled, isChanging, doToggleAgentReinforcement } =
    useAgentReinforcementToggle({ owner });

  return (
    <ContextItem
      title="Allow agent reinforcement"
      subElement="Allow Dust to analyse conversations to suggest improvement to your agents"
      visual={<SparklesIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleAgentReinforcement}
        />
      }
    />
  );
}
