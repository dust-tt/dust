import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { NetworkSection } from "@app/components/pages/workspace/developers/sections/NetworkSection";
import { PodNetworkSection } from "@app/components/pod/settings/PodNetworkSection";
import { MultiPodEnvVarsSection } from "@app/components/sandbox/MultiPodEnvVarsSection";
import { MultiPodNetworkSection } from "@app/components/sandbox/MultiPodNetworkSection";
import { SandboxEnvVarsSection } from "@app/components/sandbox/SandboxEnvVarsSection";
import type { SandboxAdminScope } from "@app/components/sandbox/SandboxScopePicker";
import { SandboxScopePicker } from "@app/components/sandbox/SandboxScopePicker";
import { useComputerAdminAccess } from "@app/hooks/useComputerAdminAccess";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import type { SandboxPodSelection } from "@app/lib/swr/sandbox";
import { usePodsAsAdmin } from "@app/lib/swr/spaces";
import { ContentMessage, InfoCircle, Page } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

export function SandboxPage() {
  const owner = useWorkspace();
  const { isAdmin, isComputerEnabled, canAdministrateComputer } =
    useComputerAdminAccess();
  const [scope, setScope] = useState<SandboxAdminScope>({ kind: "workspace" });

  const { pods, isPodsLoading } = usePodsAsAdmin({
    workspaceId: owner.sId,
    disabled: !canAdministrateComputer,
  });

  const selectedPods = useMemo(() => {
    switch (scope.kind) {
      case "workspace":
        return [];
      case "all-pods":
        return pods;
      case "pods":
        return pods.filter((pod) => scope.podIds.includes(pod.sId));
    }
  }, [scope, pods]);

  const podOptions = useMemo(
    () => pods.map((pod) => ({ sId: pod.sId, name: pod.name })),
    [pods]
  );

  const renderScopedSections = () => {
    if (scope.kind === "workspace") {
      return (
        <>
          <NetworkSection />
          <EnvironmentSection targetablePods={podOptions} />
        </>
      );
    }

    if (selectedPods.length === 0) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          {pods.length === 0
            ? "There are no Pods in this workspace yet."
            : "The selected Pods are no longer available."}
        </ContentMessage>
      );
    }

    // One Pod selected — the full single-Pod editing view.
    if (selectedPods.length === 1) {
      const pod = selectedPods[0];
      return (
        <>
          <PodNetworkSection owner={owner} podId={pod.sId} />
          <SandboxEnvVarsSection owner={owner} spaceId={pod.sId} />
        </>
      );
    }

    // Two or more — read-only comparison views. "all-pods" stays symbolic so
    // the bulk reads resolve the Pod set server-side.
    const selection: SandboxPodSelection =
      scope.kind === "all-pods"
        ? { kind: "all-pods" }
        : { kind: "pods", podIds: selectedPods.map((pod) => pod.sId) };
    return (
      <>
        <MultiPodNetworkSection
          owner={owner}
          selection={selection}
          selectedPods={selectedPods}
        />
        <MultiPodEnvVarsSection
          owner={owner}
          selection={selection}
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
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">
            View settings for
          </span>
          <SandboxScopePicker
            pods={pods}
            scope={scope}
            onScopeChange={setScope}
            isLoading={isPodsLoading}
          />
        </div>
        {renderScopedSections()}
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
