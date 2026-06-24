import { WorkspaceDefaultAgentPicker } from "@app/components/workspace/settings/WorkspaceDefaultAgentPicker";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Page } from "@dust-tt/sparkle";

interface PreferencesSectionProps {
  owner: WorkspaceType;
}

export function PreferencesSection({ owner }: PreferencesSectionProps) {
  const { hasFeature } = useFeatureFlags();
  const hasWorkspaceDefaultAgent = hasFeature("workspace_default_agent");

  // Nothing to render yet when the only preference is gated off.
  if (!hasWorkspaceDefaultAgent) {
    return null;
  }

  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.H variant="h4">Preferences</Page.H>
      <ContextItem.List>
        <div className="h-full border-b border-border dark:border-border-night" />
        {hasWorkspaceDefaultAgent && (
          <WorkspaceDefaultAgentPicker owner={owner} />
        )}
      </ContextItem.List>
    </Page.Vertical>
  );
}
