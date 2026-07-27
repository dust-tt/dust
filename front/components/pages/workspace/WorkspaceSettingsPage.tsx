import { useSetContentWidth } from "@app/components/sparkle/AppLayoutContext";
import { CapabilitiesSection } from "@app/components/workspace/settings/CapabilitiesSection";
import { IntegrationsSection } from "@app/components/workspace/settings/IntegrationsSection";
import { PreferencesSection } from "@app/components/workspace/settings/PreferencesSection";
import { WorkspaceNameEditor } from "@app/components/workspace/settings/WorkspaceNameEditor";
import { getPublishingRestrictionMessage } from "@app/lib/api/assistant/publishing_restrictions";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { Building04, Page } from "@dust-tt/sparkle";

export function WorkspaceSettingsPage() {
  useSetContentWidth("centered");
  const owner = useWorkspace();
  const { featureFlags, hasFeature } = useFeatureFlags();

  if (hasFeature("admin_governance")) {
    return null;
  }

  return (
    <Page.Vertical align="stretch" gap="xl">
      <Page.Header title="Workspace Settings" icon={Building04} />
      <Page.Vertical align="stretch" gap="md">
        <WorkspaceNameEditor owner={owner} />
      </Page.Vertical>
      <PreferencesSection owner={owner} />
      <CapabilitiesSection
        owner={owner}
        publishingRestrictionMessage={getPublishingRestrictionMessage(
          featureFlags
        )}
      />
      <IntegrationsSection owner={owner} />
    </Page.Vertical>
  );
}
