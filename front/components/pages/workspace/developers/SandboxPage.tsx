import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { NetworkSection } from "@app/components/pages/workspace/developers/sections/NetworkSection";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { ContentMessage, Globe01, InfoCircle, Page } from "@dust-tt/sparkle";

export function SandboxPage() {
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasSandboxAdmin =
    featureFlags.includes("sandbox_tools") &&
    featureFlags.includes("sandbox_workspace_admin");

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Only workspace admins can manage Computer settings.
        </ContentMessage>
      );
    }

    if (!hasSandboxAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Computer administration is not enabled for this workspace.
        </ContentMessage>
      );
    }

    return (
      <>
        <NetworkSection />
        <EnvironmentSection />
      </>
    );
  };

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title="Computer"
        icon={Globe01}
        description="Configure workspace-level network access and environment variables for the Computer."
      />
      {renderBody()}
    </Page.Vertical>
  );
}
