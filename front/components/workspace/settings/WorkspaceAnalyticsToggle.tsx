import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useWorkspaceAnalyticsToggle } from "@app/hooks/useWorkspaceAnalyticsToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface WorkspaceAnalyticsToggleProps {
  owner: WorkspaceType;
}

export function WorkspaceAnalyticsToggle({
  owner,
}: WorkspaceAnalyticsToggleProps) {
  const { t } = useLingui();
  const { isEnabled, isChanging, doToggleWorkspaceAnalytics } =
    useWorkspaceAnalyticsToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={t`Workspace Analyst`}
      description={t`Whether workspace admins get the Analyst agent and analytics tools to explore how the workspace is used`}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleWorkspaceAnalytics}
        />
      }
    />
  );
}
