import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { usePrivateConversationUrlsToggle } from "@app/hooks/usePrivateConversationUrlsToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

const LABEL = "Private conversation URLs by default";
const DESCRIPTION =
  "Whether conversation URLs are private by default, limiting access to participants.";

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
      label={LABEL}
      description={DESCRIPTION}
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
