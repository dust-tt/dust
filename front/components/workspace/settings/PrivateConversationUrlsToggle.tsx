import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { usePrivateConversationUrlsToggle } from "@app/hooks/usePrivateConversationUrlsToggle";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Lock01, SliderToggle } from "@dust-tt/sparkle";

interface PrivateConversationUrlsToggleProps {
  owner: WorkspaceType;
}

export function PrivateConversationUrlsToggle({
  owner,
}: PrivateConversationUrlsToggleProps) {
  const { isEnabled, isChanging, doTogglePrivateConversationUrls } =
    usePrivateConversationUrlsToggle({ owner });
  const { hasFeature } = useFeatureFlags();

  const label = "Private conversation URLs by default";
  const description =
    "Restrict conversation URL access to participants only by default";

  if (hasFeature("admin_governance")) {
    return (
      <GovernanceSettingRowLayout
        label={label}
        description={description}
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
      title={label}
      subElement={description}
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
