import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { NetworkSection } from "@app/components/pages/workspace/developers/sections/NetworkSection";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  CommandLineIcon,
  ContentMessage,
  InformationCircleIcon,
  Page,
} from "@dust-tt/sparkle";

export function SandboxPage() {
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const hasSandboxAdmin =
    featureFlags.includes("sandbox_tools") &&
    featureFlags.includes("sandbox_workspace_admin");

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
          Only workspace admins can manage sandbox settings.
        </ContentMessage>
      );
    }

    if (!hasSandboxAdmin) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
          Sandbox workspace administration is not enabled for this workspace.
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
        title="Sandbox"
        icon={CommandLineIcon}
        description="Configure workspace-level sandbox network access and environment variables."
      />
      {renderBody()}
    </Page.Vertical>
  );
}
