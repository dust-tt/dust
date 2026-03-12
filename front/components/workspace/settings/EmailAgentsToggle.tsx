import { useEmailAgentsToggle } from "@app/hooks/useEmailAgentsToggle";
import type { WorkspaceType } from "@app/types/user";
import { ActionMailAiIcon, ContextItem, SliderToggle } from "@dust-tt/sparkle";

interface EmailAgentsToggleProps {
  owner: WorkspaceType;
}

export function EmailAgentsToggle({ owner }: EmailAgentsToggleProps) {
  const { isEnabled, isChanging, doToggleEmailAgents } = useEmailAgentsToggle({
    owner,
  });

  return (
    <ContextItem
      title="Email agents"
      subElement="Allow triggering and interacting with agents via email"
      visual={<ActionMailAiIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleEmailAgents}
        />
      }
    />
  );
}
