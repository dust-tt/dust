import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useSlackPersonalFooterRemovalToggle } from "@app/hooks/useSlackPersonalFooterRemovalToggle";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, SlackLogo, SliderToggle } from "@dust-tt/sparkle";

export function SlackPersonalFooterRemovalToggle({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const { isEnabled, isChanging, doToggleSlackPersonalFooterRemoval } =
    useSlackPersonalFooterRemovalToggle({ owner });
  const { hasFeature } = useFeatureFlags();

  const label = '"Sent via Agent" Slack footer';
  const description =
    "Let agents remove the attribution footer on Slack messages posted with user credentials";

  if (hasFeature("admin_governance")) {
    return (
      <GovernanceSettingRowLayout
        label={label}
        description={description}
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

  return (
    <ContextItem
      title={label}
      subElement={description}
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
