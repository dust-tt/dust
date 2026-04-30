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
  const hasSandboxTools = featureFlags.includes("sandbox_tools");

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
          Only workspace admins can manage sandbox settings.
        </ContentMessage>
      );
    }

    if (!hasSandboxTools) {
      return (
        <ContentMessage variant="info" icon={InformationCircleIcon} size="lg">
          Sandbox tools are not enabled for this workspace.
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
