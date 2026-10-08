import { DomainBadge } from "@app/components/sandbox/DomainBadge";
import { DomainInputForm } from "@app/components/sandbox/DomainInputForm";
import { podIcon } from "@app/components/sandbox/pod_icon";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { compareStrings, formatList } from "@app/lib/i18n/format";
import type { SandboxPodSelection } from "@app/lib/swr/sandbox";
import {
  useBulkPodEgressPolicies,
  useBulkUpdateEgressDomain,
  useDismissPodEgressRequestByPod,
  useDismissWorkspaceEgressRequest,
  useWorkspaceEgressPolicy,
} from "@app/lib/swr/sandbox";
import type { SandboxAdminPod } from "@app/types/api/sandbox/egress_policy";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Building04,
  Button,
  Chip,
  ContentMessage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InfoCircle,
  Spinner,
  Trash01,
  XClose,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MouseEvent } from "react";
import { useMemo, useState } from "react";

interface MultiPodNetworkSectionProps {
  owner: LightWorkspaceType;
  // null when no Pods are selected (workspace-only): the pod policies aren't
  // read and only the workspace baseline is shown.
  selection: SandboxPodSelection | null;
  // The pods `selection` resolves to, for names and counts.
  selectedPods: SandboxAdminPod[];
  // When true, the workspace baseline is one of the scopes being edited.
  includeWorkspace: boolean;
}

// One editable domain across the selected scopes. `inWorkspace` means the
// workspace baseline allows it (so every Pod inherits it); `ownedByPods` are
// the selected Pods whose own policy file lists it.
export type DomainRow = {
  domain: string;
  inWorkspace: boolean;
  ownedByPods: SandboxAdminPod[];
  // Scopes this row can actually be removed from with the current selection:
  // the workspace (only when it's in the selection) plus any owning Pod. Zero
  // means the row is inherited-only here and removal must happen at the
  // workspace.
  removableScopeCount: number;
};

// One agent-requested domain awaiting review, tied to the single scope it was
// requested on — approve/reject act only on that origin.
export type PendingRequest = {
  key: string;
  domain: string;
  scopeName: string;
} & ({ scopeKind: "workspace" } | { scopeKind: "pod"; pod: SandboxAdminPod });

// Union of allowed domains across the workspace baseline and the selected Pods,
// sorted, each row tagging the owning scopes and how many of the current
// selection it can be removed from.
export function buildDomainRows({
  workspaceAllowedDomains,
  podPolicies,
  selectedPods,
  includeWorkspace,
}: {
  workspaceAllowedDomains: string[];
  podPolicies: { podId: string; policy: EgressPolicy }[];
  selectedPods: SandboxAdminPod[];
  includeWorkspace: boolean;
}): DomainRow[] {
  const workspaceDomains = new Set(workspaceAllowedDomains);
  const podOwnById = new Map(
    podPolicies.map(({ podId, policy }) => [
      podId,
      new Set(policy.allowedDomains),
    ])
  );

  const domains = new Set<string>(workspaceDomains);
  for (const { policy } of podPolicies) {
    for (const domain of policy.allowedDomains) {
      domains.add(domain);
    }
  }

  return [...domains]
    .map((domain) => {
      const inWorkspace = workspaceDomains.has(domain);
      const ownedByPods = selectedPods.filter((pod) =>
        podOwnById.get(pod.sId)?.has(domain)
      );
      return {
        domain,
        inWorkspace,
        ownedByPods,
        removableScopeCount:
          (includeWorkspace && inWorkspace ? 1 : 0) + ownedByPods.length,
      };
    })
    .sort((a, b) => compareStrings(a.domain, b.domain));
}

// Agent-requested domains awaiting review, one row per originating scope (the
// workspace when selected, plus each selected Pod). A request already covered
// by that scope's allowlist is dropped.
export function buildPendingRequests({
  workspaceRequestedDomains,
  workspaceAllowedDomains,
  podPolicies,
  selectedPods,
  includeWorkspace,
}: {
  workspaceRequestedDomains: { domain: string }[];
  workspaceAllowedDomains: string[];
  podPolicies: { podId: string; policy: EgressPolicy }[];
  selectedPods: SandboxAdminPod[];
  includeWorkspace: boolean;
}): PendingRequest[] {
  const workspaceDomains = new Set(workspaceAllowedDomains);
  const podOwnById = new Map(
    podPolicies.map(({ podId, policy }) => [
      podId,
      new Set(policy.allowedDomains),
    ])
  );
  const podPolicyById = new Map(
    podPolicies.map(({ podId, policy }) => [podId, policy])
  );

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
    for (const request of podPolicyById.get(pod.sId)?.requestedDomains ?? []) {
      if (!owned?.has(request.domain)) {
        rows.push({
          key: `${pod.sId}:${request.domain}`,
          domain: request.domain,
          scopeName: pod.name,
          scopeKind: "pod",
          pod,
        });
      }
    }
  }
  return rows.sort(
    (a, b) =>
      compareStrings(a.domain, b.domain) ||
      compareStrings(a.scopeName, b.scopeName)
  );
}

// Bulk egress editor across the selected scopes (optionally the workspace
// baseline, plus each selected Pod). Adding writes the domain to every selected
// scope; removing a row clears it from the scopes that own it. Workspace
// domains are inherited by every Pod, so they carry a Workspace badge and can
// only be removed when the workspace itself is selected.
export function MultiPodNetworkSection({
  owner,
  selection,
  selectedPods,
  includeWorkspace,
}: MultiPodNetworkSectionProps) {
  const { t } = useLingui();
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

  const [removeTarget, setRemoveTarget] = useState<DomainRow | null>(null);

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
  const pendingRequests = useMemo(
    () =>
      buildPendingRequests({
        workspaceRequestedDomains,
        workspaceAllowedDomains: workspacePolicy.allowedDomains,
        podPolicies,
        selectedPods,
        includeWorkspace,
      }),
    [
      workspaceRequestedDomains,
      workspacePolicy,
      podPolicies,
      selectedPods,
      includeWorkspace,
    ]
  );

  const isRequestBusy =
    isBulkUpdatingEgressDomain ||
    isDismissingRequest ||
    isDismissingPodEgressRequest;

  const domainRows = useMemo(
    () =>
      buildDomainRows({
        workspaceAllowedDomains: workspacePolicy.allowedDomains,
        podPolicies,
        selectedPods,
        includeWorkspace,
      }),
    [workspacePolicy, podPolicies, selectedPods, includeWorkspace]
  );

  // Adding writes to the workspace when it is selected (every Pod inherits the
  // baseline); otherwise it writes each selected Pod.
  const isDuplicate = (domain: string) =>
    includeWorkspace
      ? workspaceDomains.has(domain)
      : selectedPods.every((pod) => podOwnById.get(pod.sId)?.has(domain));
  const podCount = selectedPods.length;
  const addDomainMessage = (domain: string) =>
    includeWorkspace
      ? t`Will be added to the Workspace, inherited by all Pods, as ${domain}.`
      : t`Will be added to the ${plural(podCount, { one: "# selected Pod", other: "# selected Pods" })} as ${domain}.`;

  const approveRequestTooltip = (request: PendingRequest) => {
    const { domain } = request;
    if (request.scopeKind === "workspace") {
      return t`Add ${domain} to the Workspace`;
    }
    const podName = request.pod.name;
    return t`Add ${domain} to ${podName}`;
  };

  const rejectRequestTooltip = (request: PendingRequest) => {
    const { domain } = request;
    if (request.scopeKind === "workspace") {
      return t`Reject ${domain} for the Workspace`;
    }
    const podName = request.pod.name;
    return t`Reject ${domain} for ${podName}`;
  };

  const removeDomainTooltip = ({ domain, removableScopeCount }: DomainRow) =>
    removableScopeCount === 0
      ? t`Inherited from the Workspace — select the Workspace to remove it.`
      : t`Remove ${domain}`;

  // Refresh the affected reads after every mutation attempt: a bulk write can
  // return a partial success (some scopes changed, others failed), so gating
  // revalidation on full success would leave the changed scopes stale.
  const revalidate = async () => {
    await Promise.all([mutatePodPolicies(), mutateWorkspaceEgressPolicy()]);
  };

  const handleAddDomain = async (domain: string): Promise<boolean> => {
    const success = await bulkUpdateEgressDomain({
      includeWorkspace,
      pods: includeWorkspace ? [] : selectedPods,
      operation: "add",
      domain,
    });
    await revalidate();
    return success;
  };

  // Remove only from the scopes that actually own this row: the workspace when
  // it's a selected workspace domain, plus the specific Pods listing it — not
  // every selected scope.
  const handleRemoveDomain = async (row: DomainRow) => {
    await bulkUpdateEgressDomain({
      includeWorkspace: includeWorkspace && row.inWorkspace,
      pods: row.ownedByPods,
      operation: "remove",
      domain: row.domain,
    });
    await revalidate();
  };

  // Approving adds the domain to the request's own scope (which then covers it
  // for that scope); the pending row drops once the allowlist includes it.
  const handleApproveRequest = async (request: PendingRequest) => {
    await bulkUpdateEgressDomain({
      includeWorkspace: request.scopeKind === "workspace",
      pods: request.scopeKind === "pod" ? [request.pod] : [],
      operation: "add",
      domain: request.domain,
    });
    await revalidate();
  };

  const handleRejectRequest = async (request: PendingRequest) => {
    if (request.scopeKind === "workspace") {
      await dismissWorkspaceEgressRequest(request.domain);
    } else {
      await dismissPodEgressRequest(request.pod.sId, request.domain);
    }
    await revalidate();
  };

  // Removing a Workspace domain drops the baseline every Pod and running
  // Computer inherits, so confirm those; a Pod-only removal is scoped and goes
  // straight through.
  const requestRemoveDomain = (row: DomainRow) => {
    if (includeWorkspace && row.inWorkspace) {
      setRemoveTarget(row);
      return;
    }
    void handleRemoveDomain(row);
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) {
      return;
    }
    const row = removeTarget;
    setRemoveTarget(null);
    await handleRemoveDomain(row);
  };

  // Scope badges only disambiguate once Pods are in the mix. In the
  // Workspace-only view every row is a workspace domain, so the badges would be
  // redundant on every line — hide them to keep that default view clean.
  const showScopeBadges = selectedPods.length > 0;

  // Hide the add form until both reads resolve: duplicate detection falls back
  // to an empty policy while loading/errored, so the form would let you submit
  // without seeing the current state. `isLoading` is initial-only, so this does
  // not flicker on post-write revalidation.
  const readsReady =
    !isPodPoliciesLoading &&
    !isWorkspaceEgressPolicyLoading &&
    !isPodPoliciesError &&
    !isWorkspaceEgressPolicyError;

  const removeTargetDomain = removeTarget?.domain;
  const removeTargetPodNames = formatList(
    removeTarget?.ownedByPods.map((pod) => pod.name) ?? [],
    { type: "conjunction" },
    getActiveLocale()
  );

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
          title={t`Failed to load`}
        >
          <Trans>Network settings could not be loaded.</Trans>
        </ContentMessage>
      );
    }
    if (domainRows.length === 0 && pendingRequests.length === 0) {
      return (
        <ContentMessage variant="outline" size="lg">
          <Trans>
            No domains are currently allowed in the selected scopes.
          </Trans>
        </ContentMessage>
      );
    }

    return (
      <div className="flex w-full flex-col">
        {pendingRequests.map((request) => (
          <div key={request.key} className="flex items-center gap-3 py-1">
            <DomainBadge domain={request.domain}>
              <Chip size="xs" color="warning" label={t`Pending approval`} />
              {showScopeBadges ? (
                request.scopeKind === "workspace" ? (
                  <Chip
                    size="xs"
                    color="highlight"
                    label={t`Workspace`}
                    icon={Building04}
                  />
                ) : (
                  <Chip
                    size="xs"
                    color="highlight"
                    label={request.pod.name}
                    icon={podIcon(request.pod)}
                  />
                )
              ) : null}
            </DomainBadge>
            <Button
              variant="highlight"
              size="mini"
              label={t`Approve`}
              tooltip={approveRequestTooltip(request)}
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
              tooltip={rejectRequestTooltip(request)}
              disabled={isRequestBusy}
              onClick={() => {
                void handleRejectRequest(request);
              }}
              className="shrink-0"
            />
          </div>
        ))}
        {domainRows.map((row) => (
          <div key={row.domain} className="flex items-center gap-3 py-1">
            <DomainBadge domain={row.domain}>
              {showScopeBadges && row.inWorkspace ? (
                <Chip
                  size="xs"
                  color="highlight"
                  label={t`Workspace`}
                  icon={Building04}
                />
              ) : null}
              {row.ownedByPods.map((pod) => (
                <Chip
                  key={pod.sId}
                  size="xs"
                  color="highlight"
                  label={pod.name}
                  icon={podIcon(pod)}
                />
              ))}
            </DomainBadge>
            <Button
              variant="warning"
              size="xs"
              icon={Trash01}
              tooltip={removeDomainTooltip(row)}
              disabled={row.removableScopeCount === 0 || isRequestBusy}
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
            <DialogTitle>
              <Trans>Remove Workspace domain</Trans>
            </DialogTitle>
            <DialogDescription>
              {removeTargetPodNames.length > 0 ? (
                <Trans>
                  {removeTargetDomain} is a Workspace domain, inherited by every
                  Pod and running Computer. Removing it here drops it from the
                  Workspace and from {removeTargetPodNames}. This cannot be
                  undone.
                </Trans>
              ) : (
                <Trans>
                  {removeTargetDomain} is a Workspace domain, inherited by every
                  Pod and running Computer. Removing it here drops it from the
                  Workspace. This cannot be undone.
                </Trans>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: t`Cancel`,
              variant: "outline",
              disabled: isRequestBusy,
            }}
            rightButtonProps={{
              label: t`Remove`,
              variant: "warning",
              disabled: isRequestBusy,
              onClick: (event: MouseEvent) => {
                event.preventDefault();
                void handleConfirmRemove();
              },
            }}
          />
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-2">
        <div className="heading-sm text-foreground">
          <Trans>Allowed domains</Trans>
        </div>
        <div className="text-sm text-muted-foreground">
          <Trans>
            Domains allowed across the selected scopes. Adding writes to the
            Workspace when it is selected (inherited by all Pods), otherwise to
            each selected Pod.
          </Trans>
        </div>
        {readsReady ? (
          <DomainInputForm
            isUpdating={isRequestBusy}
            submitLabel={t`Add domain`}
            duplicateMessage={(domain) =>
              isDuplicate(domain)
                ? includeWorkspace
                  ? t`This domain is already allowed workspace-wide.`
                  : t`This domain is already allowed in every selected Pod.`
                : null
            }
            validMessage={addDomainMessage}
            onSubmit={handleAddDomain}
          />
        ) : null}
        {renderRows()}
      </div>
    </>
  );
}
