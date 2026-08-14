import type { SandboxPodSelection } from "@app/lib/swr/sandbox";
import { useBulkPodEgressPolicies } from "@app/lib/swr/sandbox";
import type { PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Chip,
  ContentMessage,
  InfoCircle,
  Page,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

interface MultiPodNetworkSectionProps {
  owner: LightWorkspaceType;
  selection: SandboxPodSelection;
  // The pods `selection` resolves to, for names and counts.
  selectedPods: PodType[];
}

// Read-only comparison of Pod-specific egress allowlists across the selected
// Pods. Editing stays in the workspace and single-Pod views; multi-Pod
// network mutations are deliberately out of scope for now.
export function MultiPodNetworkSection({
  owner,
  selection,
  selectedPods,
}: MultiPodNetworkSectionProps) {
  const { podPolicies, isPodPoliciesLoading, isPodPoliciesError } =
    useBulkPodEgressPolicies({ owner, selection });

  const podNamesById = useMemo(
    () => new Map(selectedPods.map((pod) => [pod.sId, pod.name])),
    [selectedPods]
  );

  // domain -> names of selected pods allowing it, sorted by domain.
  const domainRows = useMemo(() => {
    const podNamesByDomain = new Map<string, string[]>();
    for (const { podId, policy } of podPolicies) {
      const podName = podNamesById.get(podId);
      if (!podName) {
        continue;
      }
      for (const domain of policy.allowedDomains) {
        podNamesByDomain.set(domain, [
          ...(podNamesByDomain.get(domain) ?? []),
          podName,
        ]);
      }
    }
    return [...podNamesByDomain.entries()]
      .map(([domain, podNames]) => ({ domain, podNames }))
      .sort((a, b) => a.domain.localeCompare(b.domain));
  }, [podPolicies, podNamesById]);

  const renderBody = () => {
    if (isPodPoliciesLoading) {
      return <Spinner />;
    }
    if (isPodPoliciesError) {
      return (
        <ContentMessage
          variant="warning"
          icon={InfoCircle}
          size="lg"
          title="Failed to load"
        >
          The Pod network settings could not be loaded.
        </ContentMessage>
      );
    }
    if (domainRows.length === 0) {
      return (
        <ContentMessage variant="outline" size="lg">
          No Pod-specific domains are currently allowed in the selected Pods.
        </ContentMessage>
      );
    }

    return (
      <div className="flex w-full flex-col divide-y divide-separator">
        {domainRows.map(({ domain, podNames }) => (
          <div key={domain} className="flex items-center gap-3 py-3">
            <pre
              title={domain}
              className="min-w-0 grow overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2 text-sm text-foreground"
            >
              {domain}
            </pre>
            <Tooltip
              label={podNames.join(", ")}
              trigger={
                <Chip
                  size="xs"
                  color={
                    podNames.length === selectedPods.length
                      ? "success"
                      : "primary"
                  }
                  label={
                    podNames.length === selectedPods.length
                      ? "All Pods"
                      : `${podNames.length} of ${selectedPods.length} Pods`
                  }
                />
              }
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <Page.Vertical align="stretch" gap="lg">
      <Page.SectionHeader
        title="Allowed domains"
        description={`Pod-specific domains across the ${selectedPods.length} selected Pods, on top of the workspace allowlist. To add or remove a domain, select a single Pod; to change the workspace allowlist, switch to the Workspace view.`}
      />
      {renderBody()}
    </Page.Vertical>
  );
}
