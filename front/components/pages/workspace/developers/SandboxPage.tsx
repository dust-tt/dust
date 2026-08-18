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
  const isBulkEdit = scopeCount > 1;

  const workspaceView = (
    <>
      <NetworkSection />
      <EnvironmentSection targetablePods={podOptions} />
    </>
  );

  const renderScopedContent = () => {
    if (scopeCount === 0) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Select the Workspace or one or more Pods to view and edit Computer
          settings.
        </ContentMessage>
      );
    }

    // A single scope (the workspace) is the editable view; any combination is
    // a read-only comparison for now.
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
        {canAdministratePods ? renderScopedContent() : workspaceView}
      </>
    );
  };

  return (
    <Page.Vertical gap="xl" align="stretch">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div className="heading-2xl text-foreground">Computer</div>
          {canAdministratePods ? (
            <SandboxScopeSelector
              pods={pods}
              selection={selection}
              onChange={setSelection}
              isLoading={isPodsLoading}
            />
          ) : null}
        </div>
        <div className="text-sm text-muted-foreground">
          Configure workspace and Pod network access and environment variables
          for the Computer.
        </div>
        {canAdministratePods && isBulkEdit ? (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {scopeCount} scopes selected.
            </span>{" "}
            Changes below apply to the selected scopes unless marked
            Workspace-wide.
          </div>
        ) : null}
      </div>
      {renderBody()}
    </Page.Vertical>
  );
}
