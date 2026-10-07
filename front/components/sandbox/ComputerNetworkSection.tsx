import { MultiPodNetworkSection } from "@app/components/sandbox/MultiPodNetworkSection";
import type { SandboxScopeSelection } from "@app/components/sandbox/SandboxScopeSelector";
import { SandboxScopeSelector } from "@app/components/sandbox/SandboxScopeSelector";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useEgressPolicyPods } from "@app/lib/swr/sandbox";
import { ContentMessage, InfoCircle } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

interface ComputerNetworkSectionProps {
  canAdministrateComputer: boolean;
}

// Network is scope-aware (Workspace and/or Pods), so the scope selector lives
// with it. Shared by the Security (network tab) and legacy Computer pages.
export function ComputerNetworkSection({
  canAdministrateComputer,
}: ComputerNetworkSectionProps) {
  const { t } = useLingui();
  const owner = useWorkspace();
  const [selection, setSelection] = useState<SandboxScopeSelection>({
    includeWorkspace: true,
    podIds: [],
  });

  const { pods, isEgressPolicyPodsLoading, isEgressPolicyPodsError } =
    useEgressPolicyPods({
      owner,
      disabled: !canAdministrateComputer,
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="heading-xl text-foreground">
          <Trans>Network</Trans>
        </div>
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
          title={t`Select the Workspace or one or more Pods to view and edit network access.`}
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
}
