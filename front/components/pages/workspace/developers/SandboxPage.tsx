import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { NetworkSection } from "@app/components/pages/workspace/developers/sections/NetworkSection";
import { useAuth } from "@app/lib/auth/AuthContext";
import { ContentMessage, Globe01, InfoCircle, Page } from "@dust-tt/sparkle";

export function SandboxPage() {
  const { isAdmin } = useAuth();

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Only workspace admins can manage Computer settings.
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
