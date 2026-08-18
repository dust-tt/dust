import { Pill } from "@app/components/sandbox/Pill";
import type { SandboxPodSelection } from "@app/lib/swr/sandbox";
import {
  useBulkPodEgressPolicies,
  useBulkUpdateEgressDomain,
  useDismissPodEgressRequestByPod,
  useDismissWorkspaceEgressRequest,
  useWorkspaceEgressPolicy,
} from "@app/lib/swr/sandbox";
import { normalizeEgressPolicyDomain } from "@app/types/sandbox/egress_policy";
import type { PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoCircle,
  Input,
  Page,
  Plus,
  Spinner,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface MultiPodNetworkSectionProps {
  owner: LightWorkspaceType;
  selection: SandboxPodSelection;
  // The pods `selection` resolves to, for names and counts.
  selectedPods: PodType[];
  // When true, the workspace baseline is one of the scopes being edited.
  includeWorkspace: boolean;
}

// One editable domain across the selected scopes. `inWorkspace` means the
// workspace baseline allows it (so every Pod inherits it); `ownedByPods` are
// the selected Pods whose own policy file lists it.
type DomainRow = {
  domain: string;
  inWorkspace: boolean;
  ownedByPods: string[];
  // Scopes this row can actually be removed from with the current selection:
  // the workspace (only when it's in the selection) plus any owning Pod. Zero
  // means the row is inherited-only here and removal must happen at the
  // workspace.
  removableScopeCount: number;
};

// One agent-requested domain awaiting review, tied to the single scope it was
// requested on — approve/reject act only on that origin.
type PendingRequest = {
  key: string;
  domain: string;
  scopeName: string;
} & ({ scopeKind: "workspace" } | { scopeKind: "pod"; podId: string });

// Bulk egress editor across the selected scopes (optionally the workspace
// baseline, plus each selected Pod). Adding writes the domain to every selected
// scope; removing a row clears it from the scopes that own it. Workspace
// domains are inherited by every Pod, so they render with a neutral pill and
// can only be removed when the workspace itself is selected.
export function MultiPodNetworkSection({
  owner,
  selection,
  selectedPods,
  includeWorkspace,
}: MultiPodNetworkSectionProps) {
  const {
    podPolicies,
    isPodPoliciesLoading,
    isPodPoliciesError,
    mutatePodPolicies,
  } = useBulkPodEgressPolicies({ owner, selection });
  // Always read the workspace policy: even when it is not an editing scope, its
  // domains are inherited by every Pod and shown as such.
  const {
    policy: workspacePolicy,
    requestedDomains: workspaceRequestedDomains,
    isWorkspaceEgressPolicyLoading,
    isWorkspaceEgressPolicyError,
    mutateWorkspaceEgressPolicy,
  } = useWorkspaceEgressPolicy({ owner });
  const { bulkUpdateEgressDomain, isBulkUpdatingEgressDomain } =
    useBulkUpdateEgressDomain({ owner });
  const { dismissWorkspaceEgressRequest, isDismissingRequest } =
    useDismissWorkspaceEgressRequest({ owner });
  const { dismissPodEgressRequest, isDismissingPodEgressRequest } =
    useDismissPodEgressRequestByPod({ owner });

  const [domainInput, setDomainInput] = useState("");
  const [removeTarget, setRemoveTarget] = useState<DomainRow | null>(null);

  const totalScopes = (includeWorkspace ? 1 : 0) + selectedPods.length;

  const workspaceDomains = useMemo(
    () => new Set(workspacePolicy.allowedDomains),
    [workspacePolicy]
  );
  const podOwnById = useMemo(
    () =>
      new Map(
        podPolicies.map(({ podId, policy }) => [
          podId,
          new Set(policy.allowedDomains),
        ])
      ),
    [podPolicies]
  );
  const podPolicyById = useMemo(
    () => new Map(podPolicies.map(({ podId, policy }) => [podId, policy])),
    [podPolicies]
  );

  // Agent-requested domains awaiting review, one row per originating scope
  // (the workspace when selected, plus each selected Pod). A request already
  // covered by that scope's allowlist is dropped.
  const pendingRequests: PendingRequest[] = useMemo(() => {
    const rows: PendingRequest[] = [];
    if (includeWorkspace) {
      for (const request of workspaceRequestedDomains) {
        if (!workspaceDomains.has(request.domain)) {
          rows.push({
            key: `workspace:${request.domain}`,
            domain: request.domain,
            scopeName: "Workspace",
            scopeKind: "workspace",
          });
        }
      }
    }
    for (const pod of selectedPods) {
      const owned = podOwnById.get(pod.sId);
      for (const request of podPolicyById.get(pod.sId)?.requestedDomains ??
        []) {
        if (!owned?.has(request.domain)) {
          rows.push({
            key: `${pod.sId}:${request.domain}`,
            domain: request.domain,
            scopeName: pod.name,
            scopeKind: "pod",
            podId: pod.sId,
          });
        }
      }
    }
    return rows.sort(
      (a, b) =>
        a.domain.localeCompare(b.domain) ||
        a.scopeName.localeCompare(b.scopeName)
    );
  }, [
    includeWorkspace,
    workspaceRequestedDomains,
    workspaceDomains,
    selectedPods,
    podOwnById,
    podPolicyById,
  ]);

  const isRequestBusy =
    isBulkUpdatingEgressDomain ||
    isDismissingRequest ||
    isDismissingPodEgressRequest;

  const domainRows: DomainRow[] = useMemo(() => {
    const domains = new Set<string>(workspaceDomains);
    for (const { policy } of podPolicies) {
      for (const domain of policy.allowedDomains) {
        domains.add(domain);
      }
    }
    return [...domains]
      .map((domain) => {
        const inWorkspace = workspaceDomains.has(domain);
        const ownedByPods = selectedPods
          .filter((pod) => podOwnById.get(pod.sId)?.has(domain))
          .map((pod) => pod.name);
        return {
          domain,
          inWorkspace,
          ownedByPods,
          removableScopeCount:
            (includeWorkspace && inWorkspace ? 1 : 0) + ownedByPods.length,
        };
      })
      .sort((a, b) => a.domain.localeCompare(b.domain));
  }, [
    workspaceDomains,
    podPolicies,
    podOwnById,
    selectedPods,
    includeWorkspace,
  ]);

  const hasDomainInput = domainInput.trim().length > 0;
  const domainInputResult = hasDomainInput
    ? normalizeEgressPolicyDomain(domainInput)
    : null;
  const normalizedDomain =
    domainInputResult?.isOk() === true ? domainInputResult.value : null;
  // Adding writes to the workspace when it is selected (every Pod inherits the
  // baseline, so there is no need to also write each Pod's file); otherwise it
  // writes each selected Pod. Duplicate means the write target already allows
  // it.
  const isDuplicate =
    normalizedDomain !== null &&
    (includeWorkspace
      ? workspaceDomains.has(normalizedDomain)
      : selectedPods.every((pod) =>
          podOwnById.get(pod.sId)?.has(normalizedDomain)
        ));
  const addTargetLabel = includeWorkspace
    ? "the Workspace, inherited by all Pods,"
    : `the ${selectedPods.length} selected ${
        selectedPods.length === 1 ? "Pod" : "Pods"
      }`;
  const domainInputMessage =
    domainInputResult?.isErr() === true
      ? domainInputResult.error.message
      : isDuplicate
        ? includeWorkspace
          ? "This domain is already allowed workspace-wide."
          : "This domain is already allowed in every selected Pod."
        : normalizedDomain
          ? `Will be added to ${addTargetLabel} as ${normalizedDomain}.`
          : "Use an exact domain such as api.openai.com or a wildcard such as *.mistral.ai.";
  const isDomainInputInvalid =
    domainInputResult?.isErr() === true || isDuplicate;
  const canAddDomain =
    normalizedDomain !== null && !isDuplicate && !isBulkUpdatingEgressDomain;

  const revalidate = async () => {
    await Promise.all([mutatePodPolicies(), mutateWorkspaceEgressPolicy()]);
  };

  const handleAddDomain = async () => {
    if (!canAddDomain || normalizedDomain === null) {
      return;
    }
    const success = await bulkUpdateEgressDomain({
      includeWorkspace,
      // A workspace-wide add is inherited by every Pod, so skip writing each
      // Pod's own file; a Pod-only selection writes the selected Pods.
      pods: includeWorkspace ? [] : selectedPods,
      operation: "add",
      domain: normalizedDomain,
    });
    if (success) {
      setDomainInput("");
      await revalidate();
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    const success = await bulkUpdateEgressDomain({
      includeWorkspace,
      pods: selectedPods,
      operation: "remove",
      domain,
    });
    if (success) {
      await revalidate();
    }
  };

  // Approving adds the domain to the request's own scope (which then covers it
  // for that scope); the pending row drops once the allowlist includes it.
  const handleApproveRequest = async (request: PendingRequest) => {
    const success = await bulkUpdateEgressDomain({
      includeWorkspace: request.scopeKind === "workspace",
      pods:
        request.scopeKind === "pod"
          ? selectedPods.filter((pod) => pod.sId === request.podId)
          : [],
      operation: "add",
      domain: request.domain,
    });
    if (success) {
      await revalidate();
    }
  };

  const handleRejectRequest = async (request: PendingRequest) => {
    const success =
      request.scopeKind === "workspace"
        ? await dismissWorkspaceEgressRequest(request.domain)
        : await dismissPodEgressRequest(request.podId, request.domain);
    if (success) {
      await revalidate();
    }
  };

  // Removing a Workspace domain drops the baseline every Pod and running
  // Computer inherits, so confirm those; a Pod-only removal is scoped and goes
  // straight through.
  const requestRemoveDomain = (row: DomainRow) => {
    if (includeWorkspace && row.inWorkspace) {
      setRemoveTarget(row);
      return;
    }
    void handleRemoveDomain(row.domain);
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) {
      return;
    }
    const domain = removeTarget.domain;
    setRemoveTarget(null);
    await handleRemoveDomain(domain);
  };

  const renderRows = () => {
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
    if (domainRows.length === 0 && pendingRequests.length === 0) {
      return (
        <ContentMessage variant="outline" size="lg">
          No domains are currently allowed in the selected scopes.
        </ContentMessage>
      );
    }

    return (
      <div className="flex w-full flex-col divide-y divide-separator">
        {pendingRequests.map((request) => (
          <div key={request.key} className="flex items-center gap-3 py-3">
            <div
              title={request.domain}
              className="flex min-w-0 grow items-center gap-2 overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2"
            >
              <span className="font-mono text-sm text-foreground">
                {request.domain}
              </span>
              <Pill color="golden" label="Pending approval" />
              <Pill
                color={request.scopeKind === "workspace" ? "neutral" : "blue"}
                label={request.scopeName}
              />
            </div>
            <Button
              variant="highlight"
              size="mini"
              label="Approve"
              tooltip={`Add ${request.domain} to ${request.scopeName}`}
              disabled={isRequestBusy}
              onClick={() => {
                void handleApproveRequest(request);
              }}
              className="shrink-0"
            />
            <Button
              variant="ghost"
              size="mini"
              icon={XClose}
              tooltip={`Reject ${request.domain} for ${request.scopeName}`}
              disabled={isRequestBusy}
              onClick={() => {
                void handleRejectRequest(request);
              }}
              className="shrink-0"
            />
          </div>
        ))}
        {domainRows.map((row) => (
          <div key={row.domain} className="flex items-center gap-3 py-3">
            <div
              title={row.domain}
              className="flex min-w-0 grow items-center gap-2 overflow-x-auto whitespace-nowrap rounded bg-muted-background p-2"
            >
              <span className="font-mono text-sm text-foreground">
                {row.domain}
              </span>
              {row.inWorkspace ? (
                <Pill color="neutral" label="Workspace" />
              ) : null}
              {row.ownedByPods.map((podName) => (
                <Pill key={podName} color="blue" label={podName} />
              ))}
            </div>
            <Button
              variant="warning"
              size="mini"
              icon={Trash01}
              tooltip={
                row.removableScopeCount === 0
                  ? "Inherited from the Workspace — select the Workspace to remove it."
                  : `Remove ${row.domain}`
              }
              disabled={
                row.removableScopeCount === 0 || isBulkUpdatingEgressDomain
              }
              onClick={() => requestRemoveDomain(row)}
              className="shrink-0"
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
          }
        }}
      >
        <DialogContent size="md" isAlertDialog>
          <DialogHeader hideButton>
            <DialogTitle>Remove Workspace domain</DialogTitle>
            <DialogDescription>
              {removeTarget?.domain} is a Workspace domain, inherited by every
              Pod and running Computer. Removing it here drops it from the
              Workspace
              {removeTarget && removeTarget.ownedByPods.length > 0
                ? ` and ${removeTarget.ownedByPods.join(", ")}`
                : ""}
              . This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              disabled: isBulkUpdatingEgressDomain,
            }}
            rightButtonProps={{
              label: "Remove",
              variant: "warning",
              disabled: isBulkUpdatingEgressDomain,
              onClick: (event: React.MouseEvent) => {
                event.preventDefault();
                void handleConfirmRemove();
              },
            }}
          />
        </DialogContent>
      </Dialog>

      <Page.Vertical align="stretch" gap="lg">
        <Page.SectionHeader
          title="Allowed domains"
          description={`Domains allowed across the ${totalScopes} selected scopes. Adding writes to the Workspace when it is selected (inherited by all Pods), otherwise to each selected Pod.`}
        />
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAddDomain();
          }}
        >
          <div className="grow">
            <Input
              label="Domain"
              name="domain"
              placeholder="e.g. api.openai.com or *.mistral.ai"
              value={domainInput}
              message={domainInputMessage}
              messageStatus={isDomainInputInvalid ? "error" : "info"}
              onChange={(event) => setDomainInput(event.target.value)}
              disabled={isBulkUpdatingEgressDomain}
            />
          </div>
          <Button
            type="submit"
            label="Add domain"
            icon={Plus}
            disabled={!canAddDomain}
            isLoading={isBulkUpdatingEgressDomain}
            className="mt-0 sm:mt-7"
          />
        </form>
        {renderRows()}
      </Page.Vertical>
    </>
  );
}
