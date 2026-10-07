import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { usePrivateConversationUrlsToggle } from "@app/hooks/usePrivateConversationUrlsToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface PrivateConversationUrlsToggleProps {
  owner: WorkspaceType;
}

export function PrivateConversationUrlsToggle({
  owner,
}: PrivateConversationUrlsToggleProps) {
  const { t } = useLingui();
  const { isEnabled, isChanging, doTogglePrivateConversationUrls } =
    usePrivateConversationUrlsToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={t`Private conversation URLs by default`}
      description={t`Whether conversation URLs are private by default, limiting access to participants`}
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
