import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useSlackPersonalFooterRemovalToggle } from "@app/hooks/useSlackPersonalFooterRemovalToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface SlackPersonalFooterRemovalToggleProps {
  owner: WorkspaceType;
}

export function SlackPersonalFooterRemovalToggle({
  owner,
}: SlackPersonalFooterRemovalToggleProps) {
  const { t } = useLingui();
  const { isEnabled, isChanging, doToggleSlackPersonalFooterRemoval } =
    useSlackPersonalFooterRemovalToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={t`"Sent via Agent" Slack footer`}
      description={t`Whether agents can remove the "Sent via Agent" footer on Slack messages posted with user credentials`}
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
