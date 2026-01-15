import {
  Button,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type { Organization } from "@workos-inc/node";
import { useEffect, useState } from "react";
import { mutate } from "swr";

import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import type { PlanType, WorkspaceDomain, WorkspaceType } from "@app/types";

type AutoJoinMode =
  | { kind: "none" }
  | { kind: "single"; domain: WorkspaceDomain }
  | { kind: "multiple" };

function getAutoJoinMode(
  workspaceVerifiedDomains: WorkspaceDomain[]
): AutoJoinMode {
  if (workspaceVerifiedDomains.length === 0) {
    return { kind: "none" };
  }

  if (workspaceVerifiedDomains.length === 1) {
    return { kind: "single", domain: workspaceVerifiedDomains[0] };
  }

  return { kind: "multiple" };
}

async function updateDomainAutoJoin({
  ownerId,
  domain,
  enabled,
}: {
  ownerId: string;
  domain: string;
  enabled: boolean;
}): Promise<Response> {
  return clientFetch(`/api/w/${ownerId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      domain,
      domainAutoJoinEnabled: enabled,
    }),
  });
}

async function applyDomainAutoJoinUpdates({
  ownerId,
  updates,
}: {
  ownerId: string;
  updates: { domain: string; enabled: boolean }[];
}): Promise<{ failedDomains: string[] }> {
  const results = await Promise.allSettled(
    updates.map((u) =>
      updateDomainAutoJoin({
        ownerId,
        domain: u.domain,
        enabled: u.enabled,
      })
    )
  );

  const failedDomains: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failedDomains.push(updates[index].domain);
      return;
    }

    if (!result.value.ok) {
      failedDomains.push(updates[index].domain);
    }
  });

  return { failedDomains };
}

interface MultiDomainAutoJoinModalProps {
  workspaceVerifiedDomains: WorkspaceDomain[];
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}

function MultiDomainAutoJoinModal({
  workspaceVerifiedDomains,
  isOpen,
  onClose,
  owner,
}: MultiDomainAutoJoinModalProps) {
  const sendNotification = useSendNotification();
  const [domainOverrides, setDomainOverrides] = useState<Record<string, boolean>>(
    {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset pending changes when modal opens.
  useEffect(() => {
    if (isOpen) {
      setDomainOverrides({});
    }
  }, [isOpen]);

  const handleDomainToggle = (domain: WorkspaceDomain) => {
    setDomainOverrides((prev) => {
      const currentValue = prev[domain.domain] ?? domain.domainAutoJoinEnabled;
      const nextValue = !currentValue;

      // Keep `domainOverrides` minimal by removing overrides that match the
      // initial state. This makes `hasChanges` accurate even if the user toggles
      // a checkbox twice.
      if (nextValue === domain.domainAutoJoinEnabled) {
        const nextOverrides = { ...prev };
        delete nextOverrides[domain.domain];
        return nextOverrides;
      }

      return { ...prev, [domain.domain]: nextValue };
    });
  };

  async function handleSave(): Promise<void> {
    const domainsToUpdate = workspaceVerifiedDomains.filter((d) => {
      const desiredValue = domainOverrides[d.domain];
      return (
        desiredValue !== undefined && desiredValue !== d.domainAutoJoinEnabled
      );
    });

    if (domainsToUpdate.length === 0) {
      onClose();
      return;
    }

    const updates = domainsToUpdate.map((d) => ({
      domain: d.domain,
      enabled: domainOverrides[d.domain] ?? d.domainAutoJoinEnabled,
    }));

    setIsSubmitting(true);

    try {
      const { failedDomains } = await applyDomainAutoJoinUpdates({
        ownerId: owner.sId,
        updates,
      });

      if (failedDomains.length > 0) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: `Failed to update auto-join for: ${failedDomains.map((d) => `@${d}`).join(", ")}`,
        });
      } else {
        sendNotification({
          type: "success",
          title: "Auto-join updated",
          description: "Domain auto-join settings have been updated.",
        });
      }

      // Refresh the verified domains data
      void mutate(`/api/w/${owner.sId}/verified-domains`);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  const isDomainEnabled = (domain: WorkspaceDomain): boolean =>
    domainOverrides[domain.domain] ?? domain.domainAutoJoinEnabled;

  const enabledDomainNames = workspaceVerifiedDomains
    .filter(isDomainEnabled)
    .map((d) => d.domain);
  const enabledDomainCount = enabledDomainNames.length;
  const hasChanges = Object.keys(domainOverrides).length > 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Configure Auto-join</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Select which domains should allow users to automatically join your
              workspace when they sign up with a matching email address.
            </p>
            <div className="flex flex-col gap-3">
              {workspaceVerifiedDomains.map((d) => (
                <div key={d.domain} className="flex items-center gap-2">
                  <Checkbox
                    id={`domain-${d.domain}`}
                    checked={isDomainEnabled(d)}
                    onCheckedChange={() => handleDomainToggle(d)}
                    disabled={isSubmitting}
                  />
                  <Label htmlFor={`domain-${d.domain}`} className="font-normal">
                    @{d.domain}
                  </Label>
                </div>
              ))}
            </div>
            {enabledDomainCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Anyone with a{" "}
                {enabledDomainNames
                  .map((domain) => `@${domain}`)
                  .join(" or ")}{" "}
                email will be able to join your workspace automatically.
              </p>
            )}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
            disabled: isSubmitting,
          }}
          rightButtonProps={{
            label: isSubmitting ? "Saving..." : "Save",
            variant: "primary",
            onClick: handleSave,
            disabled: !hasChanges || isSubmitting,
            icon: isSubmitting ? Spinner : undefined,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface AutoJoinToggleProps {
  domains: Organization["domains"];
  workspaceVerifiedDomains: WorkspaceDomain[];
  owner: WorkspaceType;
  plan: PlanType;
}

export function AutoJoinToggle({
  domains,
  workspaceVerifiedDomains,
  owner,
  plan,
}: AutoJoinToggleProps) {
  const sendNotification = useSendNotification();
  const [showUpgradePlanDialog, setShowUpgradePlanDialog] = useState(false);
  const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
  const [isUpdatingSingleDomain, setIsUpdatingSingleDomain] = useState(false);

  const autoJoinMode = getAutoJoinMode(workspaceVerifiedDomains);

  const autoJoinEnabledDomains = workspaceVerifiedDomains.filter(
    (d) => d.domainAutoJoinEnabled
  );
  const isAutoJoinEnabled = autoJoinEnabledDomains.length > 0;

  const statusDescription = (() => {
    if (autoJoinMode.kind === "none") {
      return "Add a verified domain to enable auto-join for your team members.";
    }

    if (isAutoJoinEnabled) {
      const domainList = autoJoinEnabledDomains
        .map((d) => `@${d.domain}`)
        .join(", ");
      return `Auto-join is enabled for ${domainList}. Team members with these email domains can automatically join your workspace.`;
    }

    return "Allow your team members to automatically access your Dust workspace when they sign up with a verified email domain.";
  })();

  async function handleSingleDomainToggle(
    domain: WorkspaceDomain
  ): Promise<void> {
    setIsUpdatingSingleDomain(true);
    try {
      const nextValue = !domain.domainAutoJoinEnabled;
      const { failedDomains } = await applyDomainAutoJoinUpdates({
        ownerId: owner.sId,
        updates: [
          {
            domain: domain.domain,
            enabled: nextValue,
          },
        ],
      });

      if (failedDomains.length > 0) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: `Failed to update auto-join for @${domain.domain}.`,
        });
        return;
      }

      sendNotification({
        type: "success",
        title: "Auto-join updated",
        description: `Auto-join ${nextValue ? "enabled" : "disabled"} for @${domain.domain}.`,
      });

      void mutate(`/api/w/${owner.sId}/verified-domains`);
    } finally {
      setIsUpdatingSingleDomain(false);
    }
  }

  const handleButtonClick = () => {
    if (!isUpgraded(plan)) {
      setShowUpgradePlanDialog(true);
      return;
    }

    switch (autoJoinMode.kind) {
      case "multiple":
        setIsConfigureModalOpen(true);
        return;
      case "single":
        void handleSingleDomainToggle(autoJoinMode.domain);
        return;
      case "none":
        return;
    }
  };

  let buttonLabel: string;
  let buttonVariant: "primary" | "outline";
  switch (autoJoinMode.kind) {
    case "multiple":
      buttonLabel = isAutoJoinEnabled ? "Configure" : "Enable Auto-join";
      buttonVariant = isAutoJoinEnabled ? "outline" : "primary";
      break;
    case "single":
      if (isUpdatingSingleDomain) {
        buttonLabel = "Updating...";
      } else if (autoJoinMode.domain.domainAutoJoinEnabled) {
        buttonLabel = "De-activate Auto-join";
      } else {
        buttonLabel = "Activate Auto-join";
      }
      buttonVariant = autoJoinMode.domain.domainAutoJoinEnabled
        ? "outline"
        : "primary";
      break;
    case "none":
      buttonLabel = "Enable Auto-join";
      buttonVariant = "primary";
      break;
  }

  const isButtonDisabled =
    domains.length === 0 ||
    autoJoinMode.kind === "none" ||
    !!owner.ssoEnforced ||
    (autoJoinMode.kind === "single" && isUpdatingSingleDomain);

  let tooltip: string | undefined;
  if (owner.ssoEnforced) {
    tooltip = "Auto-join is not available when SSO is enforced";
  } else if (domains.length === 0) {
    tooltip = "Add a domain to enable Auto-join";
  } else if (autoJoinMode.kind === "none") {
    tooltip = "Verify a domain to enable Auto-join";
  }

  return (
    <>
      {autoJoinMode.kind === "multiple" && (
        <MultiDomainAutoJoinModal
          workspaceVerifiedDomains={workspaceVerifiedDomains}
          isOpen={isConfigureModalOpen}
          onClose={() => {
            setIsConfigureModalOpen(false);
          }}
          owner={owner}
        />
      )}
      <UpgradePlanDialog
        isOpen={showUpgradePlanDialog}
        onClose={() => setShowUpgradePlanDialog(false)}
        workspaceId={owner.sId}
        title="Free plan"
        description="You cannot enable auto-join with the free plan. Upgrade your plan to invite other members."
      />
      <Page.Vertical>
        <div className="flex w-full flex-row items-center gap-2">
          <div className="flex-1">
            <div className="flex flex-row items-center gap-2">
              <Page.H variant="h5">Auto-join Workspace</Page.H>
            </div>
            <Page.P variant="secondary">{statusDescription}</Page.P>
          </div>
          <div className="flex justify-end">
            <Button
              label={buttonLabel}
              size="sm"
              variant={buttonVariant}
              tooltip={tooltip}
              disabled={isButtonDisabled}
              onClick={handleButtonClick}
            />
          </div>
        </div>
      </Page.Vertical>
    </>
  );
}
