import { EnvironmentSection } from "@app/components/pages/workspace/developers/sections/EnvironmentSection";
import { NetworkSection } from "@app/components/pages/workspace/developers/sections/NetworkSection";
import { MultiPodEnvVarsSection } from "@app/components/sandbox/MultiPodEnvVarsSection";
import { MultiPodNetworkSection } from "@app/components/sandbox/MultiPodNetworkSection";
import { PodComparisonPicker } from "@app/components/sandbox/PodComparisonPicker";
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
  const [comparedPodIds, setComparedPodIds] = useState<string[]>([]);

  const { pods, isPodsLoading } = usePodsAsAdmin({
    workspaceId: owner.sId,
    disabled: !canAdministrateComputer,
  });

  const podOptions = useMemo(
    () => pods.map((pod) => ({ sId: pod.sId, name: pod.name })),
    [pods]
  );

  const selectedPods = useMemo(() => {
    const set = new Set(comparedPodIds);
    return pods.filter((pod) => set.has(pod.sId));
  }, [comparedPodIds, pods]);

  const renderPodsSection = () => {
    if (!hasSandboxFunctions) {
      return (
        <ContentMessage variant="info" icon={InfoCircle} size="lg">
          Pod-level Computer settings require Sandbox Functions, which is not
          enabled for this workspace.
        </ContentMessage>
      );
    }

    const selection = {
      kind: "pods" as const,
      podIds: selectedPods.map((pod) => pod.sId),
    };

    return (
      <>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">
            Compare Pods
          </span>
          <PodComparisonPicker
            pods={pods}
            selectedPodIds={comparedPodIds}
            onChange={setComparedPodIds}
            isLoading={isPodsLoading}
          />
        </div>
        {selectedPods.length === 0 ? (
          <ContentMessage variant="info" icon={InfoCircle} size="lg">
            {pods.length === 0
              ? "There are no Pods in this workspace yet."
              : "Select Pods to compare their network and environment settings against the workspace baseline."}
          </ContentMessage>
        ) : (
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
        )}
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
        <div className="flex flex-col gap-4">
          <div className="heading-lg">Workspace</div>
          <NetworkSection />
          <EnvironmentSection targetablePods={podOptions} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="heading-lg">Pods</div>
          {renderPodsSection()}
        </div>
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
