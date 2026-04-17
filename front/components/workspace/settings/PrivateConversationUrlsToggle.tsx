import { usePrivateConversationUrlsToggle } from "@app/hooks/usePrivateConversationUrlsToggle";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, LockIcon, SliderToggle } from "@dust-tt/sparkle";

interface PrivateConversationUrlsToggleProps {
  owner: WorkspaceType;
}

export function PrivateConversationUrlsToggle({
  owner,
}: PrivateConversationUrlsToggleProps) {
  const { isEnabled, isChanging, doTogglePrivateConversationUrls } =
    usePrivateConversationUrlsToggle({ owner });

  return (
    <ContextItem
      title="Private conversation URLs by default"
      subElement="Restrict conversation URL access to participants and workspace admins by default"
      visual={<LockIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doTogglePrivateConversationUrls}
        />
      }
    />
  );
}
