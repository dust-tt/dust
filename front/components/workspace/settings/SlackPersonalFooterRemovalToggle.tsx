import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useSlackPersonalFooterRemovalToggle } from "@app/hooks/useSlackPersonalFooterRemovalToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

const LABEL = '"Sent via Agent" Slack footer';
const DESCRIPTION =
  'Whether agents can remove the "Sent via Agent" footer on Slack messages posted with user credentials.';

export function SlackPersonalFooterRemovalToggle({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const { isEnabled, isChanging, doToggleSlackPersonalFooterRemoval } =
    useSlackPersonalFooterRemovalToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={LABEL}
      description={DESCRIPTION}
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
