import {  useReinforcementToggle } from "@app/lib/swr/useReinforcementToggle";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, SliderToggle, SparklesIcon } from "@dust-tt/sparkle";

interface ReinforcementToggleProps {
  owner: WorkspaceType;
}

export function ReinforcementToggle({
  owner,
}: ReinforcementToggleProps) {
  const { isEnabled, isChanging, doToggleReinforcement } =
    useReinforcementToggle({ owner });

  return (
    <ContextItem
      title="Allow reinforcement"
      subElement="Allow Dust to analyse conversations to suggest improvements."
      visual={<SparklesIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleReinforcement}
        />
      }
    />
  );
}
