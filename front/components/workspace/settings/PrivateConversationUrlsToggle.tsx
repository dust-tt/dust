import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { usePrivateConversationUrlsToggle } from "@app/hooks/usePrivateConversationUrlsToggle";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Lock01, SliderToggle } from "@dust-tt/sparkle";

const LABEL = "Private conversation URLs by default";
const DESCRIPTION =
  "Control whether conversation URLs are private by default, limiting access to participants.";

interface PrivateConversationUrlsToggleProps {
  owner: WorkspaceType;
}

export function PrivateConversationUrlsToggle({
  owner,
}: PrivateConversationUrlsToggleProps) {
  const { isEnabled, isChanging, doTogglePrivateConversationUrls } =
    usePrivateConversationUrlsToggle({ owner });
  const { hasFeature } = useFeatureFlags();

  if (hasFeature("admin_governance")) {
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

  return (
    <ContextItem
      title={LABEL}
      subElement="Restrict conversation URL access to participants only by default"
      visual={<Lock01 className="h-6 w-6" />}
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
