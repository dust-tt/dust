import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useWorkspaceAnalyticsToggle } from "@app/hooks/useWorkspaceAnalyticsToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

const LABEL = "Workspace Analyst";
const DESCRIPTION =
  "Whether workspace admins get the Analyst agent and analytics tools to explore how the workspace is used";

interface WorkspaceAnalyticsToggleProps {
  owner: WorkspaceType;
}

export function WorkspaceAnalyticsToggle({
  owner,
}: WorkspaceAnalyticsToggleProps) {
  const { isEnabled, isChanging, doToggleWorkspaceAnalytics } =
    useWorkspaceAnalyticsToggle({ owner });

  return (
    <GovernanceSettingRowLayout
      label={LABEL}
      description={DESCRIPTION}
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
