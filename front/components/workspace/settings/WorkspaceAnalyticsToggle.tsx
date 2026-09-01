import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useWorkspaceAnalyticsToggle } from "@app/hooks/useWorkspaceAnalyticsToggle";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

export const WORKSPACE_ANALYTICS_LABEL = "Workspace Analyst";
export const WORKSPACE_ANALYTICS_DESCRIPTION =
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
      label={WORKSPACE_ANALYTICS_LABEL}
      description={WORKSPACE_ANALYTICS_DESCRIPTION}
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
