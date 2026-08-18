import type { SandboxPodSelection } from "@app/lib/swr/sandbox";
import {
  useBulkPodEgressPolicies,
  useWorkspaceEgressPolicy,
} from "@app/lib/swr/sandbox";
import type { PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessage, InfoCircle, Page, Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

interface MultiPodNetworkSectionProps {
  owner: LightWorkspaceType;
  selection: SandboxPodSelection;
  // The pods `selection` resolves to, for names and counts.
  selectedPods: PodType[];
  // When true, fold the workspace allowlist in as an extra "Workspace" scope.
  includeWorkspace: boolean;
}

// Read-only comparison of egress allowlists across the selected scopes
// (optionally the Workspace, plus each selected Pod). Editing stays in the
// workspace and single-Pod views; multi-Pod network mutations are
// deliberately out of scope for now.
export function MultiPodNetworkSection({
  owner,
  selection,
  selectedPods,
  includeWorkspace,
}: MultiPodNetworkSectionProps) {
  const { podPolicies, isPodPoliciesLoading, isPodPoliciesError } =
    useBulkPodEgressPolicies({ owner, selection });
  const {
    policy: workspacePolicy,
    isWorkspaceEgressPolicyLoading,
    isWorkspaceEgressPolicyError,
  } = useWorkspaceEgressPolicy({ owner, disabled: !includeWorkspace });

  const podNamesById = useMemo(
    () => new Map(selectedPods.map((pod) => [pod.sId, pod.name])),
    [selectedPods]
  );

  const totalScopes = (includeWorkspace ? 1 : 0) + selectedPods.length;

  // domain -> names of selected scopes allowing it, sorted by domain.
  const domainRows = useMemo(() => {
    const scopeNamesByDomain = new Map<string, string[]>();
    const addScope = (domain: string, scopeName: string) => {
      scopeNamesByDomain.set(domain, [
        ...(scopeNamesByDomain.get(domain) ?? []),
        scopeName,
      ]);
    };
    if (includeWorkspace) {
      for (const domain of workspacePolicy.allowedDomains) {
        addScope(domain, "Workspace");
      }
    }
    for (const { podId, policy } of podPolicies) {
      const podName = podNamesById.get(podId);
      if (!podName) {
        continue;
      }
      for (const domain of policy.allowedDomains) {
        addScope(domain, podName);
      }
    }
    return [...scopeNamesByDomain.entries()]
      .map(([domain, scopeNames]) => ({ domain, scopeNames }))
      .sort((a, b) => a.domain.localeCompare(b.domain));
  }, [podPolicies, podNamesById, includeWorkspace, workspacePolicy]);

  const renderBody = () => {
    if (isPodPoliciesLoading || isWorkspaceEgressPolicyLoading) {
      return <Spinner />;
    }
    if (isPodPoliciesError || isWorkspaceEgressPolicyError) {
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
          No domains are currently allowed in the selected scopes.
        </ContentMessage>
      );
    }

    return (
      <div className="flex w-full flex-col divide-y divide-separator">
        {domainRows.map(({ domain, scopeNames }) => (
          <div key={domain} className="flex items-center gap-3 py-3">
            <div
              title={domain}
              className="flex min-w-0 grow items-center gap-2 overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2"
            >
              <span className="font-mono text-sm text-foreground">
                {domain}
              </span>
              {scopeNames.map((scopeName, index) => (
                <span
                  key={`${scopeName}-${index}`}
                  className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                >
                  {scopeName}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Page.Vertical align="stretch" gap="lg">
      <Page.SectionHeader
        title="Allowed domains"
        description={`Domains allowed across the ${totalScopes} selected scopes. To add or remove a domain, select a single Pod or the Workspace.`}
      />
      {renderBody()}
    </Page.Vertical>
  );
}
