import { Pill } from "@app/components/sandbox/Pill";
import type { SandboxPodSelection } from "@app/lib/swr/sandbox";
import {
  useBulkPodEgressPolicies,
  useBulkUpdateEgressDomain,
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
    isWorkspaceEgressPolicyLoading,
    isWorkspaceEgressPolicyError,
    mutateWorkspaceEgressPolicy,
  } = useWorkspaceEgressPolicy({ owner });
  const { bulkUpdateEgressDomain, isBulkUpdatingEgressDomain } =
    useBulkUpdateEgressDomain({ owner });

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
  // Nothing to add when every editing scope already allows the domain.
  const isDuplicate =
    normalizedDomain !== null &&
    (!includeWorkspace || workspaceDomains.has(normalizedDomain)) &&
    selectedPods.every((pod) => podOwnById.get(pod.sId)?.has(normalizedDomain));
  const domainInputMessage =
    domainInputResult?.isErr() === true
      ? domainInputResult.error.message
      : isDuplicate
        ? "This domain is already allowed in every selected scope."
        : normalizedDomain
          ? `Will be added to the ${totalScopes} selected scopes as ${normalizedDomain}.`
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
      pods: selectedPods,
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
    if (domainRows.length === 0) {
      return (
        <ContentMessage variant="outline" size="lg">
          No domains are currently allowed in the selected scopes.
        </ContentMessage>
      );
    }

    return (
      <div className="flex w-full flex-col divide-y divide-separator">
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
          description={`Domains allowed across the ${totalScopes} selected scopes. Adding writes to every selected scope; Workspace domains are inherited by all Pods.`}
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
