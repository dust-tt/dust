import { useWorkspaceAnalyticsToggle } from "@app/hooks/useWorkspaceAnalyticsToggle";
import type { WorkspaceType } from "@app/types/user";
import { BarChart01, ContextItem, SliderToggle } from "@dust-tt/sparkle";

interface WorkspaceAnalyticsToggleProps {
  owner: WorkspaceType;
}

export function WorkspaceAnalyticsToggle({
  owner,
}: WorkspaceAnalyticsToggleProps) {
  const { isEnabled, isChanging, doToggleWorkspaceAnalytics } =
    useWorkspaceAnalyticsToggle({ owner });

  return (
    <ContextItem
      title="Workspace Analyst"
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
