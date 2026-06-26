import { useSlackPersonalFooterRemovalToggle } from "@app/hooks/useSlackPersonalFooterRemovalToggle";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, SlackLogo, SliderToggle } from "@dust-tt/sparkle";

export function SlackPersonalFooterRemovalToggle({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const { isEnabled, isChanging, doToggleSlackPersonalFooterRemoval } =
    useSlackPersonalFooterRemovalToggle({ owner });

  return (
    <ContextItem
      title="Slack attribution footer"
      subElement="Allow agents to remove the 'Sent via Agent_name' footer when posting Slack messages"
      visual={<SlackLogo className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleSlackPersonalFooterRemoval}
        />
      }
    />
  );
}
