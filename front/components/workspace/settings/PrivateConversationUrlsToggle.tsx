import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { usePrivateConversationUrlsToggle } from "@app/hooks/usePrivateConversationUrlsToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

export const PRIVATE_CONVERSATION_URLS_LABEL =
  "Private conversation URLs by default";
export const PRIVATE_CONVERSATION_URLS_DESCRIPTION =
  "Whether conversation URLs are private by default, limiting access to participants";

interface PrivateConversationUrlsToggleProps {
  owner: WorkspaceType;
}

export function PrivateConversationUrlsToggle({
  owner,
}: PrivateConversationUrlsToggleProps) {
  const { isEnabled, isChanging, doTogglePrivateConversationUrls } =
    usePrivateConversationUrlsToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={PRIVATE_CONVERSATION_URLS_LABEL}
      description={PRIVATE_CONVERSATION_URLS_DESCRIPTION}
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
