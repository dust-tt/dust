import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { NetworkSection } from "@app/components/pages/workspace/developers/sections/NetworkSection";
import { AgentRequestedDomainsSetting } from "@app/components/sandbox/AgentRequestedDomainsSetting";
import { MultiPodEnvVarsSection } from "@app/components/sandbox/MultiPodEnvVarsSection";
import { MultiPodNetworkSection } from "@app/components/sandbox/MultiPodNetworkSection";
import type { SandboxScopeSelection } from "@app/components/sandbox/SandboxScopeSelector";
import { SandboxScopeSelector } from "@app/components/sandbox/SandboxScopeSelector";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { usePodsAsAdmin } from "@app/lib/swr/spaces";
import { ContentMessage, InfoCircle, Page } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

export function SandboxPage() {
  const owner = useWorkspace();
  const {
    isAdmin,
    isComputerEnabled,
    hasSandboxFunctions,
    canAdministrateComputer,
  } = useComputerAdminAccess();
  const [selection, setSelection] = useState<SandboxScopeSelection>({
    includeWorkspace: true,
    podIds: [],
  });

  const { pods, isPodsLoading } = usePodsAsAdmin({
    workspaceId: owner.sId,
    disabled: !canAdministrateComputer || !hasSandboxFunctions,
  });

  const podOptions = useMemo(
    () => pods.map((pod) => ({ sId: pod.sId, name: pod.name })),
    [pods]
  );

  const selectedPods = useMemo(() => {
    const set = new Set(selection.podIds);
    return pods.filter((pod) => set.has(pod.sId));
  }, [selection.podIds, pods]);

  const workspaceView = (
    <>
      <NetworkSection />
      <EnvironmentSection targetablePods={podOptions} />
    </>
  );

  const renderScopedContent = () => {
    const scopeCount =
      (selection.includeWorkspace ? 1 : 0) + selectedPods.length;
    if (scopeCount === 0) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Select the Workspace or one or more Pods to view.
        </ContentMessage>
      );
    }

    // A single scope (the workspace) is the editable view; any combination is
    // a read-only comparison.
    if (selection.includeWorkspace && selectedPods.length === 0) {
      return workspaceView;
    }

    const podSelection = {
      kind: "pods" as const,
      podIds: selectedPods.map((pod) => pod.sId),
    };
    return (
      <>
        <MultiPodNetworkSection
          owner={owner}
          includeWorkspace={selection.includeWorkspace}
          selection={podSelection}
          selectedPods={selectedPods}
        />
        <MultiPodEnvVarsSection
          owner={owner}
          includeWorkspace={selection.includeWorkspace}
          selection={podSelection}
          selectedPods={selectedPods}
          allPods={podOptions}
        />
      </>
    );
  };

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
        {!hasSandboxFunctions ? (
          // Without Sandbox Functions there are no Pod settings to compare —
          // just the editable workspace view.
          workspaceView
        ) : (
          <>
            <div className="flex">
              <SandboxScopeSelector
                pods={pods}
                selection={selection}
                onChange={setSelection}
                isLoading={isPodsLoading}
              />
            </div>
            {renderScopedContent()}
          </>
        )}
      </>
    );
  };

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Header
        title="Computer"
        description="Configure workspace and Pod network access and environment variables for the Computer."
      />
      {renderBody()}
    </Page.Vertical>
  );
}
