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

import { UpgradePlanDialog } from "@app/components/workspace/UpgradePlanDialog";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { isUpgraded } from "@app/lib/plans/plan_codes";
import type { PlanType, WorkspaceDomain, WorkspaceType } from "@app/types";

interface DomainAutoJoinModalProps {
  workspaceVerifiedDomains: WorkspaceDomain[];
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}

function DomainAutoJoinModal({
  workspaceVerifiedDomains,
  isOpen,
  onClose,
  owner,
}: DomainAutoJoinModalProps) {
  const sendNotification = useSendNotification();
  const [selectedDomains, setSelectedDomains] = useState<
    Record<string, boolean>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize selected domains when modal opens
  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, boolean> = {};
      for (const d of workspaceVerifiedDomains) {
        initial[d.domain] = d.domainAutoJoinEnabled;
      }
      setSelectedDomains(initial);
      setHasChanges(false);
    }
  }, [isOpen, workspaceVerifiedDomains]);

  const handleDomainToggle = (domain: string) => {
    setSelectedDomains((prev) => ({
      ...prev,
      [domain]: !prev[domain],
    }));
    setHasChanges(true);
  };

  async function handleSave(): Promise<void> {
    setIsSubmitting(true);

    try {
      // Attempt all domain updates and collect failures
      const failedDomains: string[] = [];

      for (const d of workspaceVerifiedDomains) {
        const newValue = selectedDomains[d.domain] ?? false;
        if (newValue !== d.domainAutoJoinEnabled) {
          const res = await clientFetch(`/api/w/${owner.sId}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              domain: d.domain,
              domainAutoJoinEnabled: newValue,
            }),
          });

          if (!res.ok) {
            failedDomains.push(d.domain);
          }
        }
      }

      if (failedDomains.length > 0) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: `Failed to update auto-join for: ${failedDomains.map((d) => `@${d}`).join(", ")}`,
        });
        // Reload to show actual state from server
      }

      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    } finally {
      setIsSubmitting(false);
    }
  }

  const enabledCount = Object.values(selectedDomains).filter(Boolean).length;

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
                    checked={selectedDomains[d.domain] ?? false}
                    onClick={() => handleDomainToggle(d.domain)}
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor={`domain-${d.domain}`}
                    className="font-normal"
                  >
                    @{d.domain}
                  </Label>
                </div>
              ))}
            </div>
            {enabledCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Anyone with a{" "}
                {Object.entries(selectedDomains)
                  .filter(([, enabled]) => enabled)
                  .map(([domain]) => `@${domain}`)
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
  const [isUpdating, setIsUpdating] = useState(false);

  const enabledDomains = workspaceVerifiedDomains.filter(
    (d) => d.domainAutoJoinEnabled
  );
  const hasAnyAutoJoinEnabled = enabledDomains.length > 0;
  const hasMultipleDomains = workspaceVerifiedDomains.length > 1;

  // For single domain: simple toggle behavior
  const singleDomain = workspaceVerifiedDomains[0];
  const singleDomainEnabled = singleDomain?.domainAutoJoinEnabled ?? false;

  const getStatusDescription = () => {
    if (workspaceVerifiedDomains.length === 0) {
      return "Add a verified domain to enable auto-join for your team members.";
    }

    if (hasAnyAutoJoinEnabled) {
      const domainList = enabledDomains.map((d) => `@${d.domain}`).join(", ");
      return `Auto-join is enabled for ${domainList}. Team members with these email domains can automatically join your workspace.`;
    }

    return "Allow your team members to automatically access your Dust workspace when they sign up with a verified email domain.";
  };

  // Simple toggle for single domain
  async function handleSingleDomainToggle(): Promise<void> {
    if (!singleDomain) {
      return;
    }

    setIsUpdating(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain: singleDomain.domain,
          domainAutoJoinEnabled: !singleDomainEnabled,
        }),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: `Failed to update auto-join for @${singleDomain.domain}.`,
        });
      } else {
        window.location.reload();
      }
    } finally {
      setIsUpdating(false);
    }
  }

  const handleButtonClick = () => {
    if (!isUpgraded(plan)) {
      setShowUpgradePlanDialog(true);
      return;
    }

    if (hasMultipleDomains) {
      setIsConfigureModalOpen(true);
    } else {
      void handleSingleDomainToggle();
    }
  };

  const getButtonLabel = () => {
    if (isUpdating) {
      return "Updating...";
    }
    if (hasMultipleDomains) {
      return hasAnyAutoJoinEnabled ? "Configure" : "Enable Auto-join";
    }
    return singleDomainEnabled ? "De-activate Auto-join" : "Activate Auto-join";
  };

  const getButtonVariant = () => {
    if (hasMultipleDomains) {
      return hasAnyAutoJoinEnabled ? "outline" : "primary";
    }
    return singleDomainEnabled ? "outline" : "primary";
  };

  return (
    <>
      <DomainAutoJoinModal
        workspaceVerifiedDomains={workspaceVerifiedDomains}
        isOpen={isConfigureModalOpen}
        onClose={() => {
          setIsConfigureModalOpen(false);
        }}
        owner={owner}
      />
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
            <Page.P variant="secondary">{getStatusDescription()}</Page.P>
          </div>
          <div className="flex justify-end">
            <Button
              label={getButtonLabel()}
              size="sm"
              variant={getButtonVariant()}
              tooltip={
                owner.ssoEnforced
                  ? "Auto-join is not available when SSO is enforced"
                  : domains.length === 0
                    ? "Add a domain to enable Auto-join"
                    : undefined
              }
              disabled={
                domains.length === 0 || !!owner.ssoEnforced || isUpdating
              }
              onClick={handleButtonClick}
            />
          </div>
        </div>
      </Page.Vertical>
    </>
  );
}
