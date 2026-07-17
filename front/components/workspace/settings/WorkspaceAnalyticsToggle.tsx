import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useWorkspaceAnalyticsToggle } from "@app/hooks/useWorkspaceAnalyticsToggle";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { BarChart01, ContextItem, SliderToggle } from "@dust-tt/sparkle";

const LABEL = "Workspace Analyst";
const DESCRIPTION =
  "Control whether workspace admins get the Analyst agent and analytics tools to explore how the workspace is used.";

interface WorkspaceAnalyticsToggleProps {
  owner: WorkspaceType;
}

export function WorkspaceAnalyticsToggle({
  owner,
}: WorkspaceAnalyticsToggleProps) {
  const { isEnabled, isChanging, doToggleWorkspaceAnalytics } =
    useWorkspaceAnalyticsToggle({ owner });
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
            onClick={doToggleWorkspaceAnalytics}
          />
        }
      />
    );
  }

  return (
    <ContextItem
      title={LABEL}
      subElement="Give workspace admins the Analyst agent and analytics tools to explore how the workspace is being used"
      visual={<BarChart01 className="h-6 w-6" />}
      hasSeparatorIfLast={true}
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
