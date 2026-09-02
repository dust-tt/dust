import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useSlackPersonalFooterRemovalToggle } from "@app/hooks/useSlackPersonalFooterRemovalToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

export const SLACK_PERSONAL_FOOTER_REMOVAL_LABEL =
  '"Sent via Agent" Slack footer';
export const SLACK_PERSONAL_FOOTER_REMOVAL_DESCRIPTION =
  'Whether agents can remove the "Sent via Agent" footer on Slack messages posted with user credentials';

export function SlackPersonalFooterRemovalToggle({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const { isEnabled, isChanging, doToggleSlackPersonalFooterRemoval } =
    useSlackPersonalFooterRemovalToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={SLACK_PERSONAL_FOOTER_REMOVAL_LABEL}
      description={SLACK_PERSONAL_FOOTER_REMOVAL_DESCRIPTION}
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
