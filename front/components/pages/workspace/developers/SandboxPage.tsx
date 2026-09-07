import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { NetworkSection } from "@app/components/pages/workspace/developers/sections/NetworkSection";
import { AgentRequestedDomainsSetting } from "@app/components/sandbox/AgentRequestedDomainsSetting";
import { MultiPodNetworkSection } from "@app/components/sandbox/MultiPodNetworkSection";
import type { SandboxScopeSelection } from "@app/components/sandbox/SandboxScopeSelector";
import { SandboxScopeSelector } from "@app/components/sandbox/SandboxScopeSelector";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useEgressPolicyPods } from "@app/lib/swr/sandbox";
import { ContentMessage, InfoCircle, Page } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

export function SandboxPage() {
  const owner = useWorkspace();
  const { isAdmin, isComputerEnabled, canAdministratePodNetwork } =
    useComputerAdminAccess();
  const [selection, setSelection] = useState<SandboxScopeSelection>({
    includeWorkspace: true,
    podIds: [],
  });

  // Only Pods with their own policy are offered; a brand-new Pod is configured
  // from its own settings page, then appears here.
  const { pods, isEgressPolicyPodsLoading, isEgressPolicyPodsError } =
    useEgressPolicyPods({
      owner,
      disabled: !canAdministratePodNetwork,
    });

  const selectedPods = useMemo(() => {
    const set = new Set(selection.podIds);
    return pods.filter((pod) => set.has(pod.sId));
  }, [selection.podIds, pods]);

  const scopeCount = (selection.includeWorkspace ? 1 : 0) + selectedPods.length;

  // Workspace-only leaves this null so the multi-pod read is skipped and only
  // the workspace baseline is shown.
  const podSelection =
    selectedPods.length > 0
      ? { kind: "pods" as const, podIds: selectedPods.map((pod) => pod.sId) }
      : null;

  // Network is scope-aware (Workspace and/or Pods), so the scope selector lives
  // with it. Environment variables stay workspace-scoped.
  const renderNetwork = () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="heading-xl text-foreground">Network</div>
        <div className="shrink-0">
          <SandboxScopeSelector
            pods={pods}
            selection={selection}
            onChange={setSelection}
            isLoading={isEgressPolicyPodsLoading}
            isError={isEgressPolicyPodsError}
          />
        </div>
      </div>
      {scopeCount === 0 ? (
        <ContentMessage
          variant="info"
          icon={InfoCircle}
          size="lg"
          title="Select the Workspace or one or more Pods to view and edit network access."
        />
      ) : (
        <MultiPodNetworkSection
          owner={owner}
          includeWorkspace={selection.includeWorkspace}
          selection={podSelection}
          selectedPods={selectedPods}
        />
      )}
    </div>
  );

  const renderBody = () => {
    if (!isAdmin) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Only workspace admins can manage Computer settings.
        </ContentMessage>
      );
    }
    if (!isComputerEnabled) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Computer administration is not enabled for this workspace.
        </ContentMessage>
      );
    }

    return (
      <>
        <AgentRequestedDomainsSetting />
        {canAdministratePodNetwork ? renderNetwork() : <NetworkSection />}
        <EnvironmentSection />
      </>
    );
  };

  return (
    <AdminPageContainer>
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Computer"
          description="Configure workspace and Pod network access and environment variables for the Computer."
        />
        {renderBody()}
      </Page.Vertical>
    </AdminPageContainer>
  );
}
