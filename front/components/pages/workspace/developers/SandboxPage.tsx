import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { NetworkSection } from "@app/components/pages/workspace/developers/sections/NetworkSection";
import { AgentRequestedDomainsSetting } from "@app/components/sandbox/AgentRequestedDomainsSetting";
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
  const { isAdmin, isComputerEnabled, canAdministratePods } =
    useComputerAdminAccess();
  const [selection, setSelection] = useState<SandboxScopeSelection>({
    includeWorkspace: true,
    podIds: [],
  });

  const { pods, isPodsLoading } = usePodsAsAdmin({
    workspaceId: owner.sId,
    disabled: !canAdministratePods,
  });

  const podOptions = useMemo(
    () => pods.map((pod) => ({ sId: pod.sId, name: pod.name })),
    [pods]
  );

  const selectedPods = useMemo(() => {
    const set = new Set(selection.podIds);
    return pods.filter((pod) => set.has(pod.sId));
  }, [selection.podIds, pods]);

  const scopeCount = (selection.includeWorkspace ? 1 : 0) + selectedPods.length;

  // Only Pods read their own policy files; workspace-only leaves this null so
  // the multi-pod read is skipped and only the workspace baseline is shown.
  const podSelection =
    selectedPods.length > 0
      ? { kind: "pods" as const, podIds: selectedPods.map((pod) => pod.sId) }
      : null;

  // Network is scope-aware (Workspace and/or Pods), so the scope selector lives
  // with it. Environment variables stay workspace-scoped for now (with the
  // per-row override-in-Pods action).
  const renderNetwork = () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="heading-xl text-foreground">Network</div>
        <div className="shrink-0">
          <SandboxScopeSelector
            pods={pods}
            selection={selection}
            onChange={setSelection}
            isLoading={isPodsLoading}
          />
        </div>
      </div>
      {scopeCount === 0 ? (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Select the Workspace or one or more Pods to view and edit network
          access.
        </ContentMessage>
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
        {canAdministratePods ? renderNetwork() : <NetworkSection />}
        <EnvironmentSection
          targetablePods={canAdministratePods ? podOptions : undefined}
        />
      </>
    );
  };

  return (
    <Page.Vertical gap="xl" align="stretch">
      <div className="flex flex-col gap-2">
        <div className="heading-2xl text-foreground">Computer</div>
        <div className="text-sm text-muted-foreground">
          Configure workspace and Pod network access and environment variables
          for the Computer.
        </div>
      </div>
      {renderBody()}
    </Page.Vertical>
  );
}
